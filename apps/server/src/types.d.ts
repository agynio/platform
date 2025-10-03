// Local module augmentation for dockerode to type platform/name query options
import 'dockerode';

declare module 'dockerode' {
  // docker.pull(image, [opts], cb)
  interface ImageCreateOptions {
    platform?: string;
  }

  // The createContainer call accepts top-level query params (name, platform)
  interface ContainerCreateOptions {
    /** Query param used by daemon; collected by dockerode from top-level options */
    name?: string;
    /** Query param for multi-arch selection */
    platform?: string;
  }
}
