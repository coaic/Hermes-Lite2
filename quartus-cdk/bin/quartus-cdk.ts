#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';

// Add assertions to test your stack
import * as assertions from 'aws-cdk-lib/assertions';

import { QuartusBatchStack } from '../lib/quartus-cdk-stack';

const app = new cdk.App();
const quartusStack = new QuartusBatchStack(app, 'QuartusBatchStack', {
  /* If you don't specify 'env', this stack will be environment-agnostic.
   * Account/Region-dependent features and context lookups will not work,
   * but a single synthesized template can be deployed anywhere. */

  /* Uncomment the next line to specialize this stack for the AWS Account
   * and Region that are implied by the current CLI configuration. */
  // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },

  /* Uncomment the next line if you know exactly what Account and Region you
   * want to deploy the stack to. */
  // env: { account: '123456789012', region: 'us-east-1' },

  /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
});

// Create a template from your stack
const template = assertions.Template.fromStack(quartusStack);

// Verify expected resources
template.hasResourceProperties('AWS::Batch::ComputeEnvironment', {
  Type: 'MANAGED',
  ComputeResources: {
    Type: 'SPOT'
  }
});

template.hasResourceProperties('AWS::Batch::JobDefinition', {
  Type: 'container',
  ContainerProperties: {
    Image: {
      'Fn::Join': [
        '',
        [
          assertions.Match.anyValue(),
          '.dkr.ecr.',
          assertions.Match.anyValue(),
          '.amazonaws.com/docker-hub/library/intel/quartuspro-v24.1'
        ]
      ]
    }
  }
});

// Check for required IAM roles
template.hasResourceProperties('AWS::IAM::Role', {
  AssumeRolePolicyDocument: {
    Statement: [
      {
        Action: 'sts:AssumeRole',
        Effect: 'Allow',
        Principal: {
          Service: 'batch.amazonaws.com'
        }
      }
    ]
  }
});
