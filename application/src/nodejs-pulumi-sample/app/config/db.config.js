require('dotenv').config();

module.exports = {
  HOST: process.env.DB_HOST,
  USER: process.env.DB_USERNAME,
  //PASSWORD: process.env.DB_PASSWORD,
  DB: process.env.DB_NAME,
  //For ennabled IAM on RDS proxy
  AWS_REGION: process.env.AWS_REGION
};