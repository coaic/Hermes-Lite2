import * as AWS from 'aws-sdk';

const batch = new AWS.Batch();

async function submitQuartusBuildJob(jobName: string, projectPath: string) {
  const params = {
    jobName: jobName,
    jobQueue: 'QuartusJobQueue',
    jobDefinition: 'QuartusJobDef',
    containerOverrides: {
      environment: [
        {
          name: 'PROJECT_PATH',
          value: projectPath
        }
      ]
    }
  };

  try {
    const response = await batch.submitJob(params).promise();
    console.log(`Job submitted successfully. Job ID: ${response.jobId}`);
    return response.jobId;
  } catch (error) {
    console.error('Error submitting job:', error);
    throw error;
  }
}
