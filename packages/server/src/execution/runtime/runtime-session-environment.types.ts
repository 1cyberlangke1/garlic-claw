export interface RuntimeSessionEnvironmentDescriptor {
  storageRoot: string;
  visibleRoot: string;
}

export interface RuntimeSessionEnvironment extends RuntimeSessionEnvironmentDescriptor {
  sessionId: string;
  sessionRoot: string;
}
