# AWS multi-tier Architecture

This challenge will use multi-tier architecture on AWS which following example layers in order to allow the correct data to be used between the system:

1. Networking
2. Database
3. Application

This will deploy a main VPC with using private and public subets at 3 available zones in Singapore region. It will deploy an Aurora Mysql serveless which is enabled auto scaling, multi AZ and using the specific roles to associate to the cluster into the private subnet. And it will
run a sample nodejs application in ECS that is fronted with an ALB.

# The Challenge Check-list

- Setup a highly available VPC
- Spin up an ECS service with 2 fargate tasks running docker
- Docker instance should run a simple Hello World nodejs app running on a HTTP server (https://github.com/kunal-relan/nodejs-pulumi-sample)
- Setup an application load balancer in front of the fargate task
- This application will connect to a MySQL database
- Setup Database using RDS Aurora
- Use private and public subnets accordingly
- Setup IAM roles and policies as required ensuring least privilege methodology

Brownie Points
- Make the RDS and ECS auto scalable 
- Add RDS proxy between ECS and RDS
- Add IAM auth to RDS Proxy and we'll call you a Rockstar


## Pre-Requisites

1. [Install Pulumi](https://www.pulumi.com/docs/reference/install).
1. Install [Node.js](https://nodejs.org/en/download).
1. Install a package manager for Node.js, such as [NPM](https://www.npmjs.com/get-npm) or [Yarn](https://yarnpkg.com/lang/en/docs/install).
1. [Configure AWS Credentials](https://www.pulumi.com/docs/reference/clouds/aws/setup/).

## Network

1.  Change to the networking project
    ```bash
    cd networking
    ```

1.  Install the dependencies.

    ```bash
    npm install
    ```

1.  Create a new Pulumi stack named `dev`.

    ```bash
    pulumi stack init dev
    ```

1. Set the Pulumi configuration variables for the project.

    ```bash
    pulumi config set aws:region ap-southeast-1
    ```
   
   If you wish to control the number of availability zones that the VPC will be created within, you can do this by setting:
   
   ```bash
   pulumi config set azCount 3
    ```

1. Deploy the networking stack

    ```bash
    pulumi up
    ```
   

## Database

1.  Change to the database project
    ```bash
    cd database
    ```

1.  Install the dependencies.

    ```bash
    npm install
    ```

1.  Create a new Pulumi stack named `dev`.

    ```bash
    pulumi stack init dev
    ```

1. Set the Pulumi configuration variables for the project:

   ```bash
   pulumi config set aws:region ap-southeast-1
   pulumi config set dbUsername myVeve
   pulumi config set dbPassword --secret myVevePassword1234!
   pulumi config set finalSnapshotIdentifier 7
   ```
   
   You need to set a stack reference to the networking stack so that the RDS Instance can be deployed into the correct VPC
   that was created in the networking stack. The stack needs to be in the form `<organization_or_user>/<projectName>/<stackName>` 
   e.g. `hangnt1001/networking/dev`:
   
   ```bash
   pulumi config set networkingStack hangnt1001/networking/dev
   ```
   
   If you wish to specify an initial database name in the RDS Instance, then you can do so by setting the following:
   
   ```bash
   pulumi config set dbName myVeveDb
   ```
   
   To be able to use RDS proxy, you needd to prepare the secret in aws secret manager and pass that secret ARN to the configure by exammple

   ```bash
        aws secretsmanager create-secret \
        --name "demo-secret" \
        --description "this is a demo secret" \
        --region ap-southeast-1 \
        --secret-string '{"username":"myVeve","password":"myVevePassword1234!","engine":"mysql","host":"demo-db-instance.cluster-cbcdhoiotoy8.ap-southeast-1.rds.amazonaws.com","port":"3306","dbClusterIdentifier":"demo-db-instance"}'

   ```

   ```bash
   pulumi config set secretArn arn:aws:secretsmanager:ap-southeast-1:414928843086:secret:demo-secret-oPZ2gn --plaintext
   ```

   Pulumi itself `NOT RECOMMENDED` to use Pulumi to provision a secret in AWS secrets manager. The reasons for this are:

    1. You need to maintain the initial secrets in the Pulumi code. Even if you use environment variables, this could be avoided.
    2. Each time you run pulumi up, there is a risk to update the DB credentials, which could break clients relying on your DB.

  Insead, you should:
   1. Prior to provioning the DB without enabled proxy, create a new secret in your account and pass that secret ARN to proxy


1. Deploy the database stack

    ```bash
    pulumi up
    ```

## Application

1.  Change to the application project
    ```bash
    cd application
    ```

1.  Install the dependencies.

    ```bash
    npm install
    ```

1.  Create a new Pulumi stack named `dev`.

    ```bash
    pulumi stack init dev
    ```

1. Set the Pulumi configuration variables for the project:

   ```bash
   pulumi config set aws:region ap-southeast-1
   ```
   
   You need to set a stack reference to the networking stack so that the RDS Instance can be deployed into the correct VPC
   that was created in the networking stack. The stack needs to be in the form `<organization_or_user>/<projectName>/<stackName>`:
   
   ```bash
   pulumi config set networkingStack hangnt1001/networking/dev
   ```
 
   You need to set a stack reference to the database stack so that the Application Instance can get the correct credentials
   and database information for application startup. The stack needs to be in the form `<organization_or_user>/<projectName>/<stackName>`:
   
   ```bash
   pulumi config set databaseStack hangnt1001/database/dev
   ```
 
1. Deploy the application stack

    ```bash
    pulumi up
    ```
   
You can then take the output `albAddress` and hit it with `curl` or in the browser to see the application running.

## Clean Up

In each of the directories, run the following command to tear down the resources that are part of our
stack.

1. Run `pulumi destroy` to tear down all resources.  You'll be prompted to make
   sure you really want to delete these resources.

   ```bash
   pulumi destroy
   ```

1. To delete the stack, run the following command.

   ```bash
   pulumi stack rm
   ```
   > **Note:** This command deletes all deployment history from the Pulumi
   > Console and cannot be undone.
