import 'reflect-metadata';

process.env.LITELLM_BASE_URL ||= 'http://127.0.0.1:4000';
process.env.LITELLM_MASTER_KEY ||= 'sk-dev-master-1234';
process.env.CONTEXT_ITEM_NULL_GUARD ||= '0';
process.env.DOCKER_RUNNER_GRPC_HOST ||= 'docker-runner';
process.env.DOCKER_RUNNER_GRPC_PORT ||= process.env.DOCKER_RUNNER_PORT || '50051';
process.env.DOCKER_RUNNER_PORT ||= process.env.DOCKER_RUNNER_GRPC_PORT;
process.env.DOCKER_RUNNER_SHARED_SECRET ||= 'test-shared-secret';
