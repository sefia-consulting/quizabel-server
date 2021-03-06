'use strict';

const uuid = require('uuid');
const randomstring = require('randomstring');
const AWS = require('aws-sdk'); // eslint-disable-line import/no-extraneous-dependencies
const dynamoDb = new AWS.DynamoDB.DocumentClient();
var QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/531557698256/totals-dev-increment';
var sqs = new AWS.SQS({region : 'us-east-1'});
var lambda = new AWS.Lambda();
AWS.config.region = process.env.REGION;

function getQuiz(id, callback) {
  console.log('getting quiz '+id);
  var lParams = {
    FunctionName: 'quiz-'+process.env.STAGE+'-get', // the lambda function we are going to invoke
    InvocationType: 'Event',       
    Payload: JSON.stringify({pathParameters:{id:id}})
  };
  console.log(lParams);
  lambda.invoke(lParams, function(err, data) {
    console.log('done invoking init');
    if (err) {
      console.log(err);
    } 
    else {
      var quiz = JSON.parse(data.body);
      callback(quiz);
      console.log('initialized totals');
      console.log(data);
    }
  });

}


function incrementQuizTotals(result, callback) {
  const id = result.quizId;
  var incResponses = result.responses ? result.responses.length : 0,
  incCorrectResponses = result.totalCorrect,
  incTime = result.totalTime, 
  incPoints = result.totalPoints,
  incCorrectPoints = result.totalCorrectPoints;

  const dynamoParams = {
    TableName: process.env.DYNAMODB_TABLE,
    Key: {
      id: id
    },
    UpdateExpression: "set updated = :ts, responseCount = responseCount + :incOne, totalResponses = totalResponses + :incResponses, totalPoints = totalPoints + :incPoints, totalTime = totalTime + :incTime,  totalCorrectPoints = totalCorrectPoints + :incCorrectPoints, totalCorrectResponses = totalCorrectResponses + :incCorrectResponses",
    ExpressionAttributeValues:{
      ":ts":new Date().getTime(),
      ":incOne":1,
      ":incTime":incTime,
      ":incResponses":incResponses,
      ":incPoints":incPoints,
      ":incCorrectPoints":incCorrectPoints,
      ":incCorrectResponses":incCorrectResponses
    },
    ReturnValues:"UPDATED_NEW"
  };

  for (var i = 0; result.responses && i < result.responses.length; i++) {
    var resultResponse = result.responses[i],
        code = 'Question'+resultResponse.code;
    dynamoParams.UpdateExpression += (', questions.'+code+'.totalResponses = questions.'+code+'.totalResponses + :incOne, questions.'+code+'.totalPoints = questions.'+code+'.totalPoints + :'+code+'Points');
    dynamoParams.ExpressionAttributeValues[':'+code+'Points'] = resultResponse.points;

    if (resultResponse.correct) {
      dynamoParams.UpdateExpression += (', questions.'+code+'.totalCorrectResponses = questions.'+code+'.totalCorrectResponses + :incOne, questions.'+code+'.totalCorrectPoints = questions.'+code+'.totalCorrectPoints + :'+code+'CorrectPoints');
      dynamoParams.ExpressionAttributeValues[':'+code+'CorrectPoints'] = resultResponse.points;
    }
    
    for (var j = 0; resultResponse.answers && j < resultResponse.answers.length; j++) {
      var responseAnswer = resultResponse.answers[j],
          aCode = 'Answer'+responseAnswer.code;
      if (responseAnswer.selected) {
        dynamoParams.UpdateExpression += (', questions.'+code+'.answers.'+aCode+'.totalResponses = questions.'+code+'.answers.'+aCode+'.totalResponses + :incOne');
        if (responseAnswer.correct) {
          dynamoParams.UpdateExpression += (', questions.'+code+'.answers.'+aCode+'.totalCorrectResponses = questions.'+code+'.answers.'+aCode+'.totalCorrectResponses + :incOne');
        }  
      }
    }
  }
  console.log(dynamoParams);
  // write the todo to the database
  dynamoDb.update(dynamoParams, (error, data) => {
    // handle potential errors
    if (error) {
      console.error(error);
      if (callback) {
        callback(null, {
          statusCode: error.statusCode || 501,
          headers: { 
            'Content-Type': 'text/plain',
            "Access-Control-Allow-Origin" : "*" // Required for CORS support to work 
          },
          body: 'Couldn\'t update the totals.',
        });  
      }
      return;
    }

    // create a response
    const response = {
      statusCode: 200,
      headers: { 
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin" : "*" // Required for CORS support to work 
      },
      body: JSON.stringify(data.Item),
    };
    if (callback) {
      callback(null, response);
    }
  });
}

function handleQuizResult(result, callback) {
  const id = result.quizId;
  if (!result || !id) {
    console.error('Validation Failed');
    callback(null, {
      statusCode: 400,
      headers: { 
        'Content-Type': 'text/plain',
        "Access-Control-Allow-Origin" : "*" // Required for CORS support to work 
      },
      body: 'Couldn\'t update the totals.'
    });
    return;
  }
  console.log(id);
  incrementQuizTotals(result, callback);

}

module.exports.handleMessages = (event, context, callback) => {
  var params = {
    QueueUrl: QUEUE_URL,
    MaxNumberOfMessages: 10
  };
  sqs.receiveMessage(params, function(err, data) {
    if (err) {
      console.error(err, err.stack);
    } else {
      var messages = data.Messages;
      if (messages && messages.length > 0) {
        messages.forEach(function(message) {
          console.log(message);
          var newBody = message.Body.replace(/""/g, 'null');
          console.log(newBody);          
          const result = JSON.parse(newBody);
          handleQuizResult(result, null);
        });
      }
    }
  });
};

module.exports.increment = (event, context, callback) => {
  console.log(event);  
  console.log(context);  
  const timestamp = new Date().getTime();
  var newBody = event.body.replace(/""/g, 'null');
  console.log(newBody);  
  const result = JSON.parse(newBody);
  //const id = event.pathParameters.id;
  handleQuizResult(result, callback);
};

module.exports.init = (event, context, callback) => {
  console.log(event);  
  console.log(context);  
  const timestamp = new Date().getTime();
  console.log(event.body);
  const quiz = event.body instanceof String ? JSON.parse(event.body) : event.body; //this is the updated quiz
  const id = quiz.id;
  if (!quiz || !id) {
    console.error('Validation Failed');
    callback(null, {
      statusCode: 400,
      headers: { 
        'Content-Type': 'text/plain',
        "Access-Control-Allow-Origin" : "*" // Required for CORS support to work 
      },
      body: 'Couldn\'t update the totals.'
    });
    return;
  }
  console.log(id);
  // look up to see if there is an existing totals record
  dynamoDb.get({ TableName: process.env.DYNAMODB_TABLE, Key: { id: id } }, (error, data) => {
    // handle potential errors
    var existingTotals = data ? data.Item : null;
    // if there is now totals record then create a new one with hashes for all questions and answers
    if (!existingTotals) {
      var totals = {
        "id": id,
        "responseCount": 0,
        "totalResponses": 0,
        "totalPoints": 0,
        "totalTime": 0,
        "totalCorrectPoints": 0,
        "totalCorrectResponses": 0,
        "questions": {}
      }
      for (var qKey in quiz.questions) {
        var question = quiz.questions[qKey],
          code = 'Question'+question.code;
        totals.questions[code] = {
          "totalPoints":0,
          "totalCorrectPoints":0,
          "totalResponses":0,
          "totalCorrectResponses":0,
          "answers": {}
        };          
        for (var aKey in question.answers) {
          var answer = question.answers[aKey],
            aCode = 'Answer'+answer.code;
          totals.questions[code].answers[aCode] = {
            "totalResponses":0,
            "totalCorrectResponses":0  
          };
        }          
      }
      dynamoDb.put({ TableName: process.env.DYNAMODB_TABLE, Key: { id: id }, Item: totals}, (error, data) => {
        if (error) {
          console.error(error);
          if (callback) {
            callback(null, {
              statusCode: error.statusCode || 501,
              headers: { 
                'Content-Type': 'text/plain',
                "Access-Control-Allow-Origin" : "*" // Required for CORS support to work 
              },
              body: 'Couldn\'t add new totals.',
            });  
          }
          return;
        }
      });
    }
    else {
      const updateParams = {
        TableName: process.env.DYNAMODB_TABLE,
        Key: { id: id },
        UpdateExpression: "set updated = :ts",
        ExpressionAttributeValues:{ ":ts":new Date().getTime()},
        ReturnValues:"UPDATED_NEW"
      };
  
      for (var qKey in quiz.questions) {
        var question = quiz.questions[qKey],
          code = 'Question'+question.code;
        if (!existingTotals.questions[code]) {
          // if question isn't there then add a new hash for it
          var qHash = {
            "totalPoints":0,
            "totalCorrectPoints":0,
            "totalResponses":0,
            "totalCorrectResponses":0,
            "answers": {}
          };
          for (var aKey in question.answers) {
            var answer = question.answers[aKey],
              aCode = 'Answer'+answer.code;
            qHash.answers[aCode] = {
              "totalResponses":0,
              "totalCorrectResponses":0
            };
          }
          updateParams.UpdateExpression += (', questions.'+code+' = :'+code+'Hash');
          updateParams.ExpressionAttributeValues[':'+code+'Hash'] = qHash;
        }
        else {
          // loop through answers and make sure there is a hash for each
          for (var aKey in question.answers) {
            var answer = question.answers[aKey],
              aCode = 'Answer'+answer.code;
            if (!existingTotals.questions[code].answers[aCode]) {
              updateParams.UpdateExpression += (', questions.'+code+'.answers.'+aCode+' = :'+aCode+'Hash');
              updateParams.ExpressionAttributeValues[':'+aCode+'Hash'] = {
                "totalResponses":0,
                "totalCorrectResponses":0
              };
            }
          }
        }
      }
      console.log(updateParams);
      // write the todo to the database
      dynamoDb.update(updateParams, (error, data) => {
         // handle potential errors
        if (error) {
          console.error(error);
          if (callback) {
            callback(null, {
              statusCode: error.statusCode || 501,
              headers: { 
                'Content-Type': 'text/plain',
                "Access-Control-Allow-Origin" : "*" // Required for CORS support to work 
              },
              body: 'Couldn\'t init the totals.',
            });  
          }
          return;
        }
        else {
          const response = {
            statusCode: 200,
            headers: { 
              "Content-Type": "application/json; charset=utf-8",
              "Access-Control-Allow-Origin" : "*" // Required for CORS support to work 
            },
            body: JSON.stringify(data.Item),
          };
          callback(null, response);        
        }    
      });
    }
  });
}

module.exports.get = (event, context, callback) => {
  const id = event.pathParameters.id,
        admin = false; // check IAM for admin?        
   if (!id) {
    console.error('Validation Failed');
    callback(null, {
      statusCode: 400,
      headers: { 
        'Content-Type': 'text/plain',
        "Access-Control-Allow-Origin" : "*" // Required for CORS support to work         
      },
      body: 'Couldn\'t get the quiz because id is missing.'
    });
    return;
  }
  var quiz = getQuiz(id);
  if (!quiz.showTotals) {
    console.error('Quiz does not allow totals to be shown');
    callback(null, {
      statusCode: 401,
      headers: { 
        'Content-Type': 'text/plain',
        "Access-Control-Allow-Origin" : "*" // Required for CORS support to work         
      },
      body: 'Quiz does not allow totals to be shown'
    });
    return;    
  }
  console.log(id);
  const params = {
    TableName: process.env.DYNAMODB_TABLE,
    Key: {
      id: id
    }
  };

  // delete the todo from the database
  dynamoDb.get(params, (error, data) => {
    // handle potential errors
    if (error) {
      console.error(error);
      callback(null, {
        statusCode: error.statusCode || 501,
        headers: { 
          'Content-Type': 'text/plain',
          "Access-Control-Allow-Origin" : "*" // Required for CORS support to work           
        },
        body: 'Couldn\'t remove the quiz item: '+error,
      });
      return;
    }
    else {
      const response = {
        statusCode: 200,
        headers: { 
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin" : "*" // Required for CORS support to work 
        },
        body: JSON.stringify(data.Item),
      };
      callback(null, response);        
    }
  });
};