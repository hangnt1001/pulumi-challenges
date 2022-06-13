import * as awsx from "@pulumi/awsx";
import * as aws from "@pulumi/aws";
import { Config, getStack, StackReference } from "@pulumi/pulumi";
import {Application} from "./application";

const config = new Config();

const networkingStack = new StackReference(config.require("networkingStack"));
const databaseStack = new StackReference(config.require("databaseStack"));
const awsAccessKey = config.requireSecret("AWS_ACCESS_KEY_ID");
const awsSecretKey = config.requireSecret("AWS_SECRET_ACCESS_KEY");
const baseTags = {
    Project: "Veve Demo",
    PulumiStack: getStack(),
};
const app = new Application("app", {
    description: `${baseTags.Project} Application`,
    baseTags: baseTags,

    vpcId: networkingStack.getOutput("appVpcId"),

    // ALB in public subnets
    albSubnetIds:  networkingStack.getOutput("appVpcPublicSubnetIds"),

    // App resources in private subnets
    appSubnetIds:  networkingStack.getOutput("appVpcPrivateSubnetIds"),

    appImage: awsx.ecs.Image.fromPath("app", "./src/nodejs-pulumi-sample"),
    appPort: 8080,

    appResources: {
        desiredCount: 2
    },

    dbName: databaseStack.getOutput("dbName"),
    dbUsername: databaseStack.getOutput("dbUsername"),
    awsRegion: "ap-southeast-1",
    awsAccessKey: awsAccessKey,
    awsSecretKey: awsSecretKey,
    dbHost: databaseStack.getOutput("proxyEndpoint"),
});

export const albAddress = app.albAddress();