import * as aws from "@pulumi/aws";
import { TargetGroup } from "@pulumi/aws/alb";
import * as awsx from "@pulumi/awsx";
import * as pulumi from "@pulumi/pulumi";
import { ComponentResource, ComponentResourceOptions, Input, Output } from "@pulumi/pulumi";

export interface ApplicationArgs {
    description: string;
    baseTags: aws.Tags;

    vpcId: Input<string>;

    albSubnetIds: Input<Input<string>[]>;

    dbHost: Input<string>;
    awsRegion: Input<string>;
    awsAccessKey: Input<string>;
    awsSecretKey: Input<string>;
    dbUsername: Input<string>;
    dbName: Input<string>;

    /**
     * Pre-existing security group(s) to use for the ALB.
     * If not specified one will be created.
     */
    albSecurityGroupIds?: Input<string>[];

    appSubnetIds: Input<Input<string>[]>;
    /**
     * Used to create security groups for the ALB.
     */
    appPort: Input<number>;

    /**
     * Pre-existing security group(s) to use for the FargateService.
     * If not specified one will be created.
     */
    appSecurityGroupIds?: Input<string>[];

    appImage: Input<string> | awsx.ecs.ContainerImageProvider;
    appResources?: ApplicationResources;
}

export interface ApplicationResources {
    desiredCount?: Input<number>;
    cpu?: Input<number>;
    memory?: Input<number>;
}
const autoScalingRole = pulumi.output(aws.iam.getRole({
    name: "AWSServiceRoleForApplicationAutoScaling_ECSService",
}));
export class Application extends ComponentResource {
    applicationLoadBalancer: awsx.elasticloadbalancingv2.ApplicationLoadBalancer;
    cluster: awsx.ecs.Cluster;
    fargateService: awsx.ecs.FargateService;
    autoScaling: aws.appautoscaling.Target;
    ecsPolicy: aws.appautoscaling.Policy;

    /**
     * Returns the DNS Name of the ALB.
     */
    public albAddress(): Output<string> {
        return this.applicationLoadBalancer.loadBalancer.dnsName;
    }

    constructor(name: string, args: ApplicationArgs, opts?: ComponentResourceOptions) {
        super("application", name, {}, opts);

        const vpc = awsx.ec2.Vpc.fromExistingIds(`${name}-service-vpc`, {
            vpcId: args.vpcId,
        }, { parent: this });

        // Use the provided pre-existing security group or create a new one.
        const albSecGroup = args.albSecurityGroupIds || [
            new awsx.ec2.SecurityGroup(`${name}-service-alb-sg`, {
                vpc: vpc,
                egress: [{ fromPort: 0, toPort: 0, protocol: "-1", cidrBlocks: ["0.0.0.0/0"] }]
            }, { parent: vpc }),
        ];

        this.applicationLoadBalancer = new awsx.elasticloadbalancingv2.ApplicationLoadBalancer(`${name}-service-alb`, {
            vpc: vpc,
            external: true,
            subnets: args.albSubnetIds,
            securityGroups: albSecGroup,
            tags: {
                ...args.baseTags,
                Name: `${args.description} ALB`,
            },
        }, { parent: this });


        const ApplicationTargetGroup = this.applicationLoadBalancer.createTargetGroup(`${name}-alb-targetgroup`, {
            port: args.appPort
        });
        const applicationListener = ApplicationTargetGroup.createListener(`${name}-service-alb-listener`, {
            vpc: vpc,
            loadBalancer: this.applicationLoadBalancer,
            port: 80,
            
        }, { parent: this.applicationLoadBalancer });

        this.cluster = new awsx.ecs.Cluster(`${name}-cluster`, {
            vpc: vpc,
            /**
             * Prevent default security groups with `[]`. Instead
             * provide security groups to the service directly.
             */
            securityGroups: [],
            tags: {
                ...args.baseTags,
                Name: `${args.description} Cluster`,
            },
        }, { parent: vpc });

        // Use the provided pre-existing security group or create a new one.
        const appSecGroup = args.appSecurityGroupIds || [
            new awsx.ec2.SecurityGroup(`${name}-service-sg`, {
                vpc: vpc,
                ingress: [
                    {
                        fromPort: args.appPort,
                        toPort: args.appPort,
                        protocol: "tcp",
                        cidrBlocks: ["0.0.0.0/0"],
                    },
                ],
                egress: [{ fromPort: 0, toPort: 0, protocol: "-1", cidrBlocks: ["0.0.0.0/0"] }],
            }, { parent: vpc }),
        ];
        const ecsTaskRole = new aws.iam.Role(`${name}-service`, {
            path: '/',
            assumeRolePolicy: JSON.stringify({
                Version: '2012-10-17',
                Statement: [{
                    Action: 'sts:AssumeRole',
                    Principal: {
                        Service: 'ecs-tasks.amazonaws.com'
                    },
                    Effect: 'Allow',
                    Sid: ''
                }]
            }),
            tags: {
                ...args.baseTags,
                Name: `${args.description} ECS service Role`,
            }
        });
        this.fargateService = new awsx.ecs.FargateService(`${name}-service`, {
            cluster: this.cluster,
            assignPublicIp: false,
            subnets: args.appSubnetIds,
            securityGroups: appSecGroup,
            desiredCount: (args.appResources || {}).desiredCount,
            taskDefinitionArgs: {
                containers: {
                    [name]: {
                        ...args.appResources, // cpu, memory, etc.
                        image: args.appImage,
                        portMappings: [applicationListener],
                        environment: [
                            {
                                name: "DB_HOST",
                                value: args.dbHost,
                            },
                            {
                                name: "DB_USERNAME",
                                value: args.dbUsername,
                            },
                            {
                                name: "AWS_REGION",
                                value: args.awsRegion,
                            },
                            {
                                name: "DB_NAME",
                                value: args.dbName,
                            },
                            {
                                name: "AWS_ACCESS_KEY_ID",
                                value: args.awsAccessKey
                            },
                            {
                                name: "AWS_SECRET_ACCESS_KEY",
                                value: args.awsSecretKey
                            }
                        ],
                    },
                },
                //taskRole: ecsTaskRole
            },
        }, { parent: this.cluster });

        this.autoScaling = new aws.appautoscaling.Target("ecs_target", {
            minCapacity: 2,
            maxCapacity: 4,
            serviceNamespace: "ecs",
            scalableDimension: "ecs:service:DesiredCount",
            roleArn: autoScalingRole.arn,
            resourceId: pulumi.interpolate`service/${this.cluster.cluster.name}/${this.fargateService.service.name}`,

        }, { parent: this });
        this.ecsPolicy = new aws.appautoscaling.Policy("ecsPolicy", {
            policyType: "StepScaling",
            resourceId: this.autoScaling.resourceId,
            scalableDimension: this.autoScaling.scalableDimension,
            serviceNamespace: this.autoScaling.serviceNamespace,
            stepScalingPolicyConfiguration: {
                adjustmentType: "ChangeInCapacity",
                cooldown: 60,
                metricAggregationType: "Maximum",
                stepAdjustments: [{
                    metricIntervalUpperBound: "0",
                    scalingAdjustment: -1,
                }],
            },
        }, { parent: this.cluster});

        this.registerOutputs({});
    }
}