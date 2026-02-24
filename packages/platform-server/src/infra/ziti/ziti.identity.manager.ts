import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { ZitiIdentityProfile } from './ziti.types';
import type { ZitiManagementClient } from './ziti.management.client';

type ZitiSdk = typeof import('@openziti/ziti-sdk-nodejs');

@Injectable()
export class ZitiIdentityManager {
  private readonly logger = new Logger(ZitiIdentityManager.name);

  async ensureIdentityMaterial(options: {
    profile: ZitiIdentityProfile;
    identityId: string;
    enrollmentTtlSeconds: number;
    directories: { identities: string; tmp: string };
    client: ZitiManagementClient;
  }): Promise<void> {
    const { profile, identityId, enrollmentTtlSeconds, directories, client } = options;
    const identityExists = await this.identityFileExists(profile.file);
    if (identityExists) {
      this.logger.log(`Ziti identity already exists for ${profile.name}`);
      return;
    }

    await this.ensureDirectories(directories, profile.file);
    const expiresAt = new Date(Date.now() + enrollmentTtlSeconds * 1000).toISOString();
    const enrollment = await client.createEnrollment({ identityId, method: 'ott', expiresAt });
    if (!enrollment?.jwt) {
      throw new Error(`Ziti enrollment for ${profile.name} did not include a JWT`);
    }

    await this.writeIdentityFile(enrollment.jwt, profile.file, directories.tmp);
    this.logger.log(`Generated Ziti identity for ${profile.name}`);
  }

  private async identityFileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async ensureDirectories(
    directories: { identities: string; tmp: string },
    destinationFile: string,
  ): Promise<void> {
    await fs.mkdir(directories.identities, { recursive: true });
    await fs.mkdir(directories.tmp, { recursive: true });
    const destinationDir = path.dirname(destinationFile);
    await fs.mkdir(destinationDir, { recursive: true });
  }

  private async writeIdentityFile(jwt: string, destination: string, tmpDir: string): Promise<void> {
    const tempFile = path.join(tmpDir, `${path.basename(destination)}.${Date.now()}.jwt`);
    await fs.writeFile(tempFile, jwt, { encoding: 'utf8', mode: 0o600 });
    try {
      const ziti = (await import('@openziti/ziti-sdk-nodejs')) as ZitiSdk;
      const identity: unknown = await ziti.enroll(tempFile);
      const serialized = JSON.stringify(identity, null, 2);
      await fs.writeFile(destination, serialized, { encoding: 'utf8', mode: 0o640 });
    } finally {
      await fs.rm(tempFile, { force: true });
    }
  }
}
