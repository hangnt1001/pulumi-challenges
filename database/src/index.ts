import { Config, getStack, StackReference } from "@pulumi/pulumi";
import {Cluster} from "./aurora-serveless";
import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

const config = new Config();

export const dbUsername = config.require("dbUsername");
export const dbPassword = config.requireSecret("dbPassword");
export const dbName = config.require("dbName");

const finalSnapshotIdentifier = config.get("finalSnapshotIdentifier")
const secretArn = config.get("secretArn");
const networkingStack = new StackReference(config.require("networkingStack"))
const baseTags = {
    Project: "Veve Demo",
    PulumiStack: getStack(),
};
const rds = new Cluster("demo-db-instance", {
    description: `${baseTags.Project} DB Instance`,
    baseTags: baseTags,

    subnetIds: networkingStack.getOutput("appVpcPrivateSubnetIds"),

    masterUsername: dbUsername,
    masterPassword: dbPassword,
    initalDbName: dbName,

    finalSnapshotIdentifier: finalSnapshotIdentifier,
    availableZones: ["ap-southeast-1a","ap-southeast-1b"],

    securityGroupIds: [networkingStack.getOutput("dbSecurityGroupId")],
    proxy: {
        enabledProxy: true,
        iam: true,
        secretArn: secretArn
    }
});

export const clusterEndpoint = rds.clusterEndpoint();
export const clusterReaderEndpoint = rds.clusterReaderEndpoint();
export const dbEndpoint = rds.clusterDbEndpoint();
export const dbPort = rds.clusterDbPort();
export const dbbId = rds.clusterDbId();

/***
 * Enable proxyEndpoint
 */
export const proxyEndpoint = rds.proxyEndpoint;