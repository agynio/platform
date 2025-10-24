import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import type { INestApplicationContext } from '@nestjs/common';

let appRef: INestApplicationContext | null = null;

export async function initDI(): Promise<void> {
  if (!appRef) {
    appRef = await NestFactory.createApplicationContext(AppModule, { logger: false });
  }
}

export async function resolve<T = any>(token: any): Promise<T> {
  if (!appRef) await initDI();
  return appRef!.get<T>(token, { strict: false });
}

export async function closeDI(): Promise<void> {
  if (appRef) {
    await appRef.close();
    appRef = null;
  }
}

// Allow main HTTP bootstrap to bind the Nest application so resolve() uses the same container.
export function setAppRef(app: INestApplicationContext) {
  appRef = app;
}
