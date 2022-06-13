import { Config, getStack } from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import {Vpc} from "./vpc";

const config = new Config();

const azCount = config.getNumber("azCount") || 2;

const baseTags = {
	ManagedBy: "Pulumi",
	PulumiStack: getStack(),
};
const availabilityZones = aws.getAvailabilityZones({
	state: "available",
});

const outputs = availabilityZones.then(zones => {
	const appVpc = new Vpc("test-nonprod-vpc", {
		description: `Veve Nonprod VPC`,
		baseTags: baseTags,
	
		baseCidr: "172.28.0.0/16",
		availabilityZoneNames: zones.names.slice(0, azCount),
		enableFlowLogs: true,
	
		endpoints: {
			s3: true,
			dynamodb: true,
		},
	});
    const dbSg = appVpc.createDBSecurityGroup({
        Vpc: appVpc,
    });

	return {
		appVpcId: appVpc.vpcId(),
		appVpcPrivateSubnetIds: appVpc.privateSubnetIds(),
		appVpcPublicSubnetIds: appVpc.publicSubnetIds(),
        dbSecurityGroupId: dbSg
	}
});


export const appVpcId = outputs.then(x => x.appVpcId);
export const appVpcPrivateSubnetIds = outputs.then(x => x.appVpcPrivateSubnetIds);
export const appVpcPublicSubnetIds = outputs.then(x => x.appVpcPublicSubnetIds);
export const dbSecurityGroupId = outputs.then(x => x.dbSecurityGroupId)