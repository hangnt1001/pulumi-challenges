/*const mysql = require("mysql");
const dbConfig = require("../config/db.config.js");

var connection = mysql.createPool({
  host: dbConfig.HOST,
  user: dbConfig.USER,
  connectTimeout: 600000,
  password: dbConfig.PASSWORD,
  database: dbConfig.DB,
  ssl: { rejectUnauthorized: false },
});
module.exports = connection;
/*
For enabled IAM auth on RDS proxy
*/
const mysql = require("mysql2");
const AWS = require('aws-sdk');
const dbConfig = require("../config/db.config.js");
const rdsSigner = new AWS.RDS.Signer({
  region: dbConfig.AWS_REGION,
  hostname: dbConfig.HOST,
  port: 3306,
  username: dbConfig.USER
});

rdsSigner.getAuthToken({ username:dbConfig.USER }, (err, password) => {
	if (err)
		console.log(`Something went wrong: ${err.stack}`)
	else
		console.log(`Great! the password is: ${password}`)
})
var connection = mysql.createPool({
  host: dbConfig.HOST,
  user: dbConfig.USER,
  connectTimeout: 600000,
  //password: dbConfig.PASSWORD,
  database: dbConfig.DB,
  ssl: { rejectUnauthorized: false },
  authPlugins: { 
    mysql_clear_password: () => () => {
			return rdsSigner.getAuthToken({ username: dbConfig.USER })
		} 
  },
});
module.exports = connection;
