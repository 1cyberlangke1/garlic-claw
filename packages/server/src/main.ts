import 'reflect-metadata';
import { bootstrapHttpApp } from './bootstrap/bootstrap-http-app';

bootstrapHttpApp().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
