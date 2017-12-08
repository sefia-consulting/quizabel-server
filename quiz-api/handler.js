'use strict';

const uuid = require('uuid');
const randomstring = require('randomstring');
const AWS = require('aws-sdk'); // eslint-disable-line import/no-extraneous-dependencies

const dynamoDb = new AWS.DynamoDB.DocumentClient();
var lambda = new AWS.Lambda();
AWS.config.region = process.env.REGION;

function initTotals(quiz) {
  console.log(quiz);
  var lParams = {
    FunctionName: 'totals-'+process.env.STAGE+'-init', // the lambda function we are going to invoke
    InvocationType: 'Event',       
    Payload: JSON.stringify({body:JSON.stringify(quiz)})
  };
  console.log('initTotals:');
  console.log(lParams);
  lambda.invoke(lParams, function(err, data) {
    console.log('done invoking init');
    if (err) {
      console.log(err);
    } 
    else {
      console.log('initialized totals');
      console.log(data);
    }
  });

}

module.exports.create = (event, context, callback) => {
  //console.log(event.body);
  if (typeof event.body !== 'string') {
    console.error('Validation Failed');
    callback(null, {
      statusCode: 400,
      headers: { 
        'Content-Type': 'text/plain',
        "Access-Control-Allow-Origin" : "*" // Required for CORS support to work 
      },
      body: 'Couldn\'t create the quiz. Request body is not string.',
    });
    return;
  }
  var newBody = event.body.replace(/""/g, 'null');
  console.log(newBody);
  
  const timestamp = new Date().getTime();
  const quiz = JSON.parse(newBody);
  var idOk = false;
  (function checkId() {
    if (!idOk) {
      quiz.id = randomstring.generate({
        length:8,
        charset:'alphanumeric',
        capitalization:'lowercase'
      });//uuid.v1();
      console.log(quiz.id);    
      dynamoDb.get({ TableName: process.env.DYNAMODB_TABLE, Key: { id: quiz.id } }, (error, data) => {
        // handle potential errors
        console.log(data);
        if (error || !data.Item || !data.Item.id) {
          idOk = true;
        }
        checkId();
      });
    }
  }());

  quiz.created = timestamp;
  quiz.updated = timestamp;
  
  const params = {
    TableName: process.env.DYNAMODB_TABLE,
    Item: quiz
  };

  // write the todo to the database
  dynamoDb.put(params, (error) => {
    // handle potential errors
    if (error) {
      console.error(error);
      callback(null, {
        statusCode: error.statusCode || 501,
        headers: { 
          'Content-Type': 'text/plain',
          "Access-Control-Allow-Origin" : "*" // Required for CORS support to work 
        },
        body: 'Couldn\'t create the quiz.',
      });
      return;
    }

    // create a response
    const response = {
      statusCode: 200,
      headers: { 
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin" : "*" // Required for CORS support to work 
      },
      body: JSON.stringify(params.Item),
    };
    initTotals(quiz);
    callback(null, response);
  });
};

module.exports.update = (event, context, callback) => {
  const timestamp = new Date().getTime();
  var newBody = event.body.replace(/""/g, 'null');
  console.log(newBody);  

  const quiz = JSON.parse(newBody);
  const id = event.pathParameters.id
  if (!quiz || !id) {
    console.error('Validation Failed');
    callback(null, {
      statusCode: 400,
      headers: { 
        'Content-Type': 'text/plain',
        "Access-Control-Allow-Origin" : "*" // Required for CORS support to work 
      },
      body: 'Couldn\'t update the quiz.'
    });
    return;
  }
  
  console.log(id);
  quiz.updated = timestamp;  
  const params = {
    TableName: process.env.DYNAMODB_TABLE,
    Key: {
      id: id
    },
    Item: quiz
  };

  // write the todo to the database
  dynamoDb.put(params, (error) => {
    // handle potential errors
    if (error) {
      console.error(error);
      callback(null, {
        statusCode: error.statusCode || 501,
        headers: { 
          'Content-Type': 'text/plain',
          "Access-Control-Allow-Origin" : "*" // Required for CORS support to work 
        },
        body: 'Couldn\'t update the quiz item.',
      });
      return;
    }

    // create a response
    const response = {
      statusCode: 200,
      headers: { 
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin" : "*" // Required for CORS support to work 
      },
      body: JSON.stringify(params.Item),
    };
    initTotals(quiz);
    callback(null, response);
  });
};

module.exports.get = (event, context, callback) => {
  const id = event.pathParameters.id
  if (!id) {
    console.error('Validation Failed');
    callback(null, {
      statusCode: 400,
      headers: { 
        'Content-Type': 'text/plain',
        "Access-Control-Allow-Origin" : "*" // Required for CORS support to work         
      },
      body: 'Couldn\'t get the quiz because id is missing.',
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