import { BatchClient, SubmitJobCommand, SubmitJobCommandInput } from "@aws-sdk/client-batch";

const batchClient = new BatchClient({ region: 'ap-southeast-2' });

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
    const command = new SubmitJobCommand(params);
    const response = await batchClient.send(command);
    console.log(`Job submitted successfully. Job ID: ${response.jobId}`);
    return response.jobId;
  } catch (error) {
    console.error('Error submitting job:', error);
    throw error;
  }
}
