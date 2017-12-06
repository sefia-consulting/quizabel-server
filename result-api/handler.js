'use strict';

const uuid = require('uuid');
const randomstring = require('randomstring');
const AWS = require('aws-sdk'); // eslint-disable-line import/no-extraneous-dependencies

const dynamoDb = new AWS.DynamoDB.DocumentClient();

var QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/531557698256/totals-dev-increment';
var sqs = new AWS.SQS({region : 'us-east-1'});
var lambda = new AWS.Lambda();
AWS.config.region = 'us-east-1';

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
      body: 'Couldn\'t create the result. Request body is not string.',
    });
    return;
  }
  var newBody = event.body.replace(/""/g, 'null');
  console.log(newBody);
  
  const timestamp = new Date().getTime();
  const result = JSON.parse(newBody);
  var idOk = false;
  (function checkId() {
    if (!idOk) {
      result.id = randomstring.generate({
        length:8,
        charset:'alphanumeric',
        capitalization:'lowercase'
      });//uuid.v1();
      console.log(result.id);    
      dynamoDb.get({ TableName: process.env.DYNAMODB_TABLE, Key: { id: result.id } }, (error, data) => {
        // handle potential errors
        console.log(data);
        if (error || !data.Item || !data.Item.id) {
          idOk = true;
        }
        checkId();
      });
    }
  }());

  result.created = timestamp;
  result.updated = timestamp;
  
  const params = {
    TableName: process.env.DYNAMODB_TABLE,
    Item: result
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
        body: 'Couldn\'t create the result.',
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
    /*
    var qParams = {
      MessageBody: JSON.stringify(result),
      QueueUrl: QUEUE_URL
    };
    sqs.sendMessage(qParams, function(qErr,qData){
      if(qErr) {
        console.log('error:',"Fail Send Message" + qErr);
        //context.done('error', "ERROR Put SQS");  // ERROR with message
      }else{
        console.log('data:',qData.MessageId);
        //context.done(null,'');  // SUCCESS 
      }
    });
    */
    var lParams = {
      FunctionName: 'totals-dev-increment', // the lambda function we are going to invoke
      InvocationType: 'Event',       
      Payload: JSON.stringify({body:response.body})
    };
  
    lambda.invoke(lParams, function(err, data) {
      console.log('done invoking increment');
      if (err) {
        console.log(err);
      } 
      else {
        console.log('incremented totals');
        console.log(data);
      }
    });
    callback(null, response);
  });
};

module.exports.update = (event, context, callback) => {
  const timestamp = new Date().getTime();
  var newBody = event.body.replace(/""/g, 'null');
  console.log(newBody);  

  const result = JSON.parse(newBody);
  const id = event.pathParameters.id
  if (!result || !id) {
    console.error('Validation Failed');
    callback(null, {
      statusCode: 400,
      headers: { 
        'Content-Type': 'text/plain',
        "Access-Control-Allow-Origin" : "*" // Required for CORS support to work 
      },
      body: 'Couldn\'t update the result.'
    });
    return;
  }
  
  console.log(id);
  result.updated = timestamp;  
  const params = {
    TableName: process.env.DYNAMODB_TABLE,
    Key: {
      id: id
    },
    Item: result
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
        body: 'Couldn\'t update the result item.',
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
      body: 'Couldn\'t get the result because id is missing.',
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
        body: 'Couldn\'t get the result item: '+error,
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