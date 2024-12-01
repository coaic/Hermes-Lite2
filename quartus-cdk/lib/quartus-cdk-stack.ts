import * as cdk from 'aws-cdk-lib';
import * as batch from 'aws-cdk-lib/aws-batch';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';


export class QuartusBatchStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, {
      ...props,
      synthesizer: new cdk.DefaultStackSynthesizer({
        qualifier: 'quartus',
        bootstrapStackVersionSsmParameter: '/cdk-bootstrap/quartus/version',
      })
    });
    // Create VPC
    const vpc = new ec2.Vpc(this, 'BatchVPC', {
      maxAzs: 2,
      natGateways: 1  // Reduce cost with single NAT gateway
    });

    // Create the Batch Service Role
    const batchServiceRole = new iam.Role(this, 'BatchServiceRole', {
      assumedBy: new iam.ServicePrincipal('batch.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSBatchServiceRole')
      ]
    });

    // Add additional required permissions if needed
    batchServiceRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'ec2:CreateNetworkInterface',
        'ec2:DescribeNetworkInterfaces',
        'ec2:DeleteNetworkInterface',
        'ec2:DescribeSubnets',
        'ec2:DescribeSecurityGroups',
        'ec2:DescribeKeyPairs',
        'ec2:DescribeInstances',
        'ec2:DescribeInstanceTypes',
        'ec2:DescribeInstanceAttribute',
        'ec2:DescribeImages',
        'ec2:RunInstances',
        'ec2:TerminateInstances',
        'autoscaling:DescribeAccountLimits',
        'autoscaling:DescribeAutoScalingGroups',
        'ecs:DescribeContainerInstances',
        'ecs:DescribeClusters',
        'ecs:ListContainerInstances',
        'ecs:DeregisterContainerInstance',
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents'
      ],
      resources: ['*']
    }));

    // Create ECR Repository
    const ecrRepository = new ecr.Repository(this, 'ECRRepository', {
      repositoryName: 'docker-hub/intel/quartuspro-v24.1'
    });

    // Get Docker Hub credentials from Secrets Manager
    const dockerHubSecret = secretsmanager.Secret.fromSecretNameV2(this, 'DockerHubSecret', 'ecr-pullthroughcache/docker-hub');

    // Create an ECR Pull Through Cache
    const ecrPullThroughCache = new ecr.CfnPullThroughCacheRule(this, 'ECRPullThroughCache', {
        ecrRepositoryPrefix: 'docker-hub',
        upstreamRegistryUrl: 'registry-1.docker.io',
        credentialArn: dockerHubSecret.secretArn
    });

    // Create Spot Fleet Role
    const spotFleetRole = new iam.Role(this, 'SpotFleetRole', {
      assumedBy: new iam.ServicePrincipal('spotfleet.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonEC2SpotFleetTaggingRole')
      ]
    });

    // Create Instance Role
    const instanceRole = new iam.Role(this, 'BatchInstanceRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonEC2ContainerServiceforEC2Role')
      ]
    });

    const instanceProfile = new iam.CfnInstanceProfile(this, 'BatchInstanceProfile', {
      roles: [instanceRole.roleName]
    });

    // Create Compute Environment
    const computeEnvironment = new batch.CfnComputeEnvironment(this, 'SpotComputeEnv', {
      type: 'MANAGED',
      computeResources: {
        type: 'SPOT',
        maxvCpus: 16,
        minvCpus: 0,
        desiredvCpus: 0,
        spotIamFleetRole: spotFleetRole.roleArn,  // Use the created role
        instanceRole: instanceProfile.attrArn,
        instanceTypes: ['c5.large', 'c5.xlarge', 'c5.2xlarge'],
        subnets: vpc.privateSubnets.map(subnet => subnet.subnetId),
        securityGroupIds: [
          new ec2.SecurityGroup(this, 'BatchSG', {
            vpc,
            allowAllOutbound: true,
          }).securityGroupId
        ],
        allocationStrategy: 'SPOT_CAPACITY_OPTIMIZED',
      },
      serviceRole: batchServiceRole.roleArn,
      state: 'ENABLED'
    });

    // Create Job Queue
    const jobQueue = new batch.CfnJobQueue(this, 'QuartusJobQueue', {
      priority: 1,
      state: 'ENABLED',
      computeEnvironmentOrder: [{
        computeEnvironment: computeEnvironment.ref,
        order: 1
      }]
    });

    // Create Job Definition
    const jobDefinition = new batch.CfnJobDefinition(this, 'QuartusJobDef', {
      type: 'container',
      containerProperties: {
        image: `${this.account}.dkr.ecr.${this.region}.amazonaws.com/docker-hub/library/intel/quartuspro-v24.1`,
        vcpus: 2,
        memory: 4096,
        command: [
          '/bin/sh', 
          '-c', 
          'quartus_sh --flow compile radioberry -c radioberry'
        ],
        volumes: [
          {
            name: 'workspace',
            host: {
              sourcePath: '/tmp/workspace'
            }
          }
        ],
        mountPoints: [
          {
            sourceVolume: 'workspace',
            containerPath: '/workspace',
            readOnly: false
          }
        ],
        environment: [
          {
            name: 'QUARTUS_64BIT',
            value: '1'
          }
        ],
        readonlyRootFilesystem: false,
        privileged: false,
      },
      retryStrategy: {
        attempts: 1
      },
      timeout: {
        attemptDurationSeconds: 3600  // 1 hour timeout
      }
    });

    // Optional: Add CloudWatch Logging
    const logConfiguration = {
      logDriver: 'awslogs',
      options: {
        'awslogs-group': '/aws/batch/quartus',
        'awslogs-region': this.region,
        'awslogs-stream-prefix': 'quartus-build'
      }
    };
  }
}
