import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import { FargateProfile } from "@pulumi/aws/eks";
import { ProxyEndpoint, SecurityGroup } from "@pulumi/aws/rds";
import * as pulumi from "@pulumi/pulumi";
import { ComponentResource, ComponentResourceOptions, Input, Output } from "@pulumi/pulumi";
import { resourceUsage } from "process";

export interface RdsClusterArgs {
    description: Input<string>;
    baseTags: aws.Tags;

    subnetIds: Input<Input<string>[]>;

    masterPassword: Input<string>;
    masterUsername: Input<string>;

    securityGroupIds: Input<string>[];
    initalDbName: Input<string>;
    availableZones: Input<string>[];

    /**
     * Default is `aurora-mysql`
     */
    engine?: Input<string>;
    /**
     * Default is `8.0.mysql_aurora.3.02.0`
     */
    engineVersion?: Input<string>;
    /**
     * Defaults to `7` days.
     */
    backupRetentionPeriod?: Input<number>;
    /**
     * Defaults to `""` so to disable.
     */
    finalSnapshotIdentifier?: Input<string>;
    /**
     * Default is `false`.
     */
    skipFinalSnapshot?: Input<boolean>;
    /**
     * * Defaults to `Mon:00:00-Mon:03:00`
     */
    preferredMaintenanceWindow?: Input<string>;
    dbClusterParameterGroupName?: Input<string>;
    /***
     * Defaut is `false`
     */
    proxy?: ProxyArgs;
}
export interface ProxyArgs {
    enabledProxy?: Input<boolean>;
    iam?: Input<boolean>;
    secretArn?: Input<string>;
}
const rdsRole = pulumi.output(aws.iam.getRole({
    name: "AWSServiceRoleForRDS",
}));

export class Cluster extends ComponentResource {
    cluster: aws.rds.Cluster;
    db: aws.rds.ClusterInstance
    subnetGroup: aws.rds.SubnetGroup;
    //enhancedRdsServiceRole: aws.iam.Role;

    private name: string;
    private baseTags: aws.Tags;

    public clusterEndpoint(): Output<string> {
        return this.cluster.endpoint;
    }
    public clusterReaderEndpoint(): Output<string> {
        return this.cluster.readerEndpoint;
    }
    public clusterId(): Output<string> {
        return this.cluster.id;
    }

    public clusterDbEndpoint(): Output<string> {
        return this.db.endpoint;
    }
    public proxyEndpoint: Output<string> | undefined;

    public clusterDbPort(): Output<string> {
        return this.db.port.apply(x => String(x))
    }

    public clusterDbId(): Output<string> {
        return this.db.id;
    }
    


    constructor(name: string, args: RdsClusterArgs, opts?: ComponentResourceOptions) {
        super("db", name, {}, opts);

        this.name = name;
        this.baseTags = args.baseTags;
        
        this.subnetGroup = new aws.rds.SubnetGroup(`${name}-subnet-group`, {
            subnetIds: args.subnetIds,
            tags: {
                ...args.baseTags,
                Name: `${args.description} Subnet Group`,
            },
        }, { parent: this });

        this.cluster = new aws.rds.Cluster(`${name}-cluster`, {
            clusterIdentifier: name,
            engine: args.engine || "aurora-mysql",
            engineMode: "provisioned",
            engineVersion: args.engineVersion || "8.0.mysql_aurora.3.02.0",
            databaseName: args.initalDbName,
            masterUsername: args.masterUsername,
            masterPassword: args.masterPassword,
            serverlessv2ScalingConfiguration: {
                maxCapacity: 1,
                minCapacity: 0.5,
            },
            iamRoles: [rdsRole.arn],


            vpcSecurityGroupIds: args.securityGroupIds || [],
            dbSubnetGroupName: this.subnetGroup.name,
            availabilityZones: args.availableZones,

            backupRetentionPeriod: args.backupRetentionPeriod || 7,
            preferredMaintenanceWindow: args.preferredMaintenanceWindow || "Mon:02:00-Mon:04:00",

            dbClusterParameterGroupName: args.dbClusterParameterGroupName || "",

            finalSnapshotIdentifier: args.finalSnapshotIdentifier || "",
            skipFinalSnapshot: args.skipFinalSnapshot || false,

            tags: {
                ...args.baseTags,
                Name: `${args.description} DB Instance`,
            },
            copyTagsToSnapshot: true,
        }, { parent: this });

        this.db = new aws.rds.ClusterInstance(`${name}-clusterInstance`, {
            clusterIdentifier: this.cluster.id,
            instanceClass: "db.serverless",
            engineVersion: this.cluster.engineVersion,
            engine: "aurora-mysql"


        }, {parent: this });
        if((args.proxy || {}).enabledProxy){
            const proxyDependsOn = []
            const proxyRole = new aws.iam.Role(`${name}-rds-proxy`, {
                path: '/',
                assumeRolePolicy: JSON.stringify({
                    Version: '2012-10-17',
                    Statement: [{
                        Action: 'sts:AssumeRole',
                        Principal: {
                            Service: 'rds.amazonaws.com'
                        },
                        Effect: 'Allow',
                        Sid: ''
                    }]
                }),
                tags: {
                    ...args.baseTags,
                    Name: `${args.description} RDS Proxy Role`,
                }
            });
            proxyDependsOn.push(proxyRole)
            const secretsManagerPolicy = new aws.iam.Policy(`${name}-rds-proxy`, {
                path: '/',
                description: 'IAM policy to allow the RDS proxy to get secrets from AWS Secret Manager',
                policy: JSON.stringify({
                    Version: '2012-10-17',
                    Statement: [{
                        Action: [
                            'secretsmanager:GetSecretValue',
                            "secretsmanager:GetRandomPassword",
                            "secretsmanager:ListSecrets"
                        ],
                        Resource: args.proxy?.secretArn,
                        Effect: 'Allow'
                    }]
                }),
                tags: {
                    ...args.baseTags,
                    Name: `${args.description} RDS Proxy Role`,
                }
            }); 
            proxyDependsOn.push(secretsManagerPolicy);
            // Attach policy
            proxyDependsOn.push(new aws.iam.RolePolicyAttachment(`${name}-rds-proxy`, {
                role: proxyRole.name,
                policyArn: secretsManagerPolicy.arn
            }));
            const rdsProxy = new aws.rds.Proxy(`${name}-proxy`, {
                name,
                roleArn: proxyRole.arn,
                engineFamily: "MYSQL",
                requireTls: true,
                vpcSubnetIds: args.subnetIds,
                auths: [{
                    authScheme: 'SECRETS',
                    description: `Authentication method used to connect the RDS proxy ${name} to the Aurora cluster ${Cluster.name}`,
                    iamAuth: args.proxy?.iam ? 'REQUIRED' : 'DISABLED',
                    secretArn: args.proxy?.secretArn
                }],
                debugLogging: false,
                idleClientTimeout: 1800,
                vpcSecurityGroupIds: args.securityGroupIds || [], // Must be set to allow traffic based on the security group
                tags: {
                    ...args.baseTags,
                    Name: `${args.description} RDS Proxy`,
                }
            }, {
                dependsOn: proxyDependsOn,
            });
            const proxyTargetGroup = new aws.rds.ProxyDefaultTargetGroup(`${name}-rds-proxy`, {
                dbProxyName: rdsProxy.name,
                connectionPoolConfig: {
                    connectionBorrowTimeout: 120,
                    maxConnectionsPercent: 100,
                    maxIdleConnectionsPercent: 50
                },
            }, {
                dependsOn: [rdsProxy,this.cluster]
            })

            // RDS Proxy target doc: https://www.pulumi.com/docs/reference/pkg/aws/rds/proxytarget/
            const proxyTarget = new aws.rds.ProxyTarget(`${name}-rds-proxy`, {
                dbClusterIdentifier: this.cluster.id,
                dbProxyName: rdsProxy.name,
                targetGroupName: proxyTargetGroup.name,
            }, {
                dependsOn: [rdsProxy, proxyTargetGroup,this.cluster, this.db]
            })
            this.proxyEndpoint = rdsProxy.endpoint;
            
        }
    }
}