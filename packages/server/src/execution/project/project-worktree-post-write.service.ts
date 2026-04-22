import fs from 'node:fs';
import path from 'node:path';
import { Injectable } from '@nestjs/common';
import ts from 'typescript';
import type {
  RuntimeFilesystemDiagnosticEntry,
  RuntimeFilesystemDiagnosticSeverity,
  RuntimeFilesystemFormattingResult,
} from '../runtime/runtime-filesystem-backend.types';
import type {
  RuntimeFilesystemPostWriteInput,
  RuntimeFilesystemPostWriteOutput,
  RuntimeFilesystemPostWriteProvider,
} from '../runtime/runtime-filesystem-post-write.service';

@Injectable()
export class ProjectWorktreePostWriteService implements RuntimeFilesystemPostWriteProvider {
  processTextFile(input: RuntimeFilesystemPostWriteInput): RuntimeFilesystemPostWriteOutput {
    const formatted = formatProjectWorktreeText(input.path, input.content);
    const nextContent = formatted?.content ?? input.content;
    return {
      content: nextContent,
      postWrite: {
        diagnostics: readProjectWorktreeDiagnostics(input, nextContent),
        formatting: formatted?.result ?? null,
      },
    };
  }
}

function formatProjectWorktreeText(
  filePath: string,
  content: string,
): {
  content: string;
  result: RuntimeFilesystemFormattingResult;
} | null {
  if (path.extname(filePath).toLowerCase() !== '.json') {
    return null;
  }
  try {
    const parsed = JSON.parse(content);
    const trailingNewline = content.endsWith('\n');
    const formatted = `${JSON.stringify(parsed, null, 2)}${trailingNewline ? '\n' : ''}`;
    if (formatted === content) {
      return null;
    }
    return {
      content: formatted,
      result: {
        kind: 'json-pretty',
        label: 'json-pretty',
      },
    };
  } catch {
    return null;
  }
}

function readProjectWorktreeDiagnostics(
  input: RuntimeFilesystemPostWriteInput,
  content: string,
): RuntimeFilesystemDiagnosticEntry[] {
  const extension = path.extname(input.path).toLowerCase();
  if (extension === '.json') {
    return readJsonDiagnostics(input.path, content);
  }
  if (['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'].includes(extension)) {
    const projectDiagnostics = readTypeScriptProjectDiagnostics(input, content);
    if (projectDiagnostics.length > 0) {
      return projectDiagnostics;
    }
    return readTypeScriptDiagnostics(input.path, content);
  }
  return [];
}

function readJsonDiagnostics(filePath: string, content: string): RuntimeFilesystemDiagnosticEntry[] {
  const result = ts.parseConfigFileTextToJson(filePath, content);
  return result.error ? [toRuntimeDiagnosticEntry(result.error, result.error.file)] : [];
}

function readTypeScriptDiagnostics(filePath: string, content: string): RuntimeFilesystemDiagnosticEntry[] {
  const extension = path.extname(filePath).toLowerCase();
  const result = ts.transpileModule(content, {
    compilerOptions: {
      allowJs: true,
      jsx: extension === '.tsx' || extension === '.jsx'
        ? ts.JsxEmit.ReactJSX
        : ts.JsxEmit.Preserve,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ESNext,
    },
    fileName: filePath,
    reportDiagnostics: true,
  });
  return (result.diagnostics ?? []).map((diagnostic) =>
    toRuntimeDiagnosticEntry(diagnostic, diagnostic.file),
  );
}

function readTypeScriptProjectDiagnostics(
  input: RuntimeFilesystemPostWriteInput,
  content: string,
): RuntimeFilesystemDiagnosticEntry[] {
  const configPath = findNearestTypeScriptProjectConfig(input.hostPath);
  if (!configPath) {
    return [];
  }
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) {
    return [toRuntimeDiagnosticEntry(configFile.error, configFile.error.file, input)];
  }
  const parsedConfig = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(configPath),
    undefined,
    configPath,
  );
  if (parsedConfig.errors.length > 0) {
    return parsedConfig.errors.map((diagnostic) =>
      toRuntimeDiagnosticEntry(diagnostic, diagnostic.file, input),
    );
  }
  const normalizedHostPath = normalizeProjectFilesystemPath(input.hostPath);
  const rootNames = parsedConfig.fileNames.some((filePath) =>
    normalizeProjectFilesystemPath(filePath) === normalizedHostPath,
  )
    ? parsedConfig.fileNames
    : [...parsedConfig.fileNames, input.hostPath];
  const compilerHost = ts.createCompilerHost(parsedConfig.options, true);
  const readSourceFile = compilerHost.getSourceFile.bind(compilerHost);
  const readFile = compilerHost.readFile.bind(compilerHost);
  const fileExists = compilerHost.fileExists.bind(compilerHost);
  compilerHost.readFile = (fileName) =>
    normalizeProjectFilesystemPath(fileName) === normalizedHostPath
      ? content
      : readFile(fileName);
  compilerHost.fileExists = (fileName) =>
    normalizeProjectFilesystemPath(fileName) === normalizedHostPath
      ? true
      : fileExists(fileName);
  compilerHost.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) =>
    normalizeProjectFilesystemPath(fileName) === normalizedHostPath
      ? ts.createSourceFile(fileName, content, languageVersion, true)
      : readSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
  const program = ts.createProgram({
    host: compilerHost,
    options: parsedConfig.options,
    projectReferences: parsedConfig.projectReferences,
    rootNames,
  });
  return selectProjectDiagnostics(
    ts.getPreEmitDiagnostics(program).map((diagnostic) =>
      toRuntimeDiagnosticEntry(diagnostic, diagnostic.file, input),
    ),
    input.path,
  );
}

function findNearestTypeScriptProjectConfig(hostPath: string): string | null {
  let currentPath = path.dirname(hostPath);
  while (true) {
    const tsconfigPath = path.join(currentPath, 'tsconfig.json');
    if (fs.existsSync(tsconfigPath)) {
      return tsconfigPath;
    }
    const jsconfigPath = path.join(currentPath, 'jsconfig.json');
    if (fs.existsSync(jsconfigPath)) {
      return jsconfigPath;
    }
    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      return null;
    }
    currentPath = parentPath;
  }
}

function normalizeProjectFilesystemPath(filePath: string): string {
  const resolvedPath = path.resolve(filePath);
  return process.platform === 'win32'
    ? resolvedPath.toLowerCase()
    : resolvedPath;
}

function selectProjectDiagnostics(
  diagnostics: RuntimeFilesystemDiagnosticEntry[],
  currentPath: string,
): RuntimeFilesystemDiagnosticEntry[] {
  const currentDiagnostics = diagnostics.filter((diagnostic) => diagnostic.path === currentPath);
  const relatedByFile = new Map<string, RuntimeFilesystemDiagnosticEntry[]>();
  for (const diagnostic of diagnostics) {
    if (diagnostic.path === currentPath) {
      continue;
    }
    const current = relatedByFile.get(diagnostic.path) ?? [];
    current.push(diagnostic);
    relatedByFile.set(diagnostic.path, current);
  }
  const relatedDiagnostics = Array.from(relatedByFile.entries())
    .sort((left, right) => left[0].localeCompare(right[0]))
    .slice(0, 5)
    .flatMap((entry) => entry[1]);
  return [...currentDiagnostics, ...relatedDiagnostics];
}

function toRuntimeDiagnosticEntry(
  diagnostic: ts.Diagnostic,
  sourceFile?: ts.SourceFile,
  input?: RuntimeFilesystemPostWriteInput,
): RuntimeFilesystemDiagnosticEntry {
  const normalizedFile = sourceFile?.fileName ?? diagnostic.file?.fileName ?? 'unknown';
  const start = diagnostic.start ?? 0;
  const locationSource = sourceFile ?? diagnostic.file;
  const lineAndCharacter = locationSource
    ? locationSource.getLineAndCharacterOfPosition(start)
    : { character: 0, line: 0 };
  return {
    ...(diagnostic.code ? { code: String(diagnostic.code) } : {}),
    column: lineAndCharacter.character + 1,
    line: lineAndCharacter.line + 1,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    path: normalizeRuntimeDiagnosticPath(normalizedFile, input),
    severity: readRuntimeDiagnosticSeverity(diagnostic.category),
    source: diagnostic.source ?? 'typescript',
  };
}

function normalizeRuntimeDiagnosticPath(
  diagnosticPath: string,
  input?: RuntimeFilesystemPostWriteInput,
): string {
  if (!input || diagnosticPath === 'unknown') {
    return diagnosticPath;
  }
  const resolvedSessionRoot = path.resolve(input.sessionRoot);
  const resolvedDiagnosticPath = path.resolve(diagnosticPath);
  const relativePath = path.relative(resolvedSessionRoot, resolvedDiagnosticPath);
  if (
    relativePath.length === 0
    || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
  ) {
    const normalizedRelativePath = relativePath.replace(/\\/g, '/');
    if (!normalizedRelativePath) {
      return input.visibleRoot;
    }
    return input.visibleRoot === '/'
      ? `/${normalizedRelativePath}`
      : `${input.visibleRoot}/${normalizedRelativePath}`;
  }
  return diagnosticPath;
}

function readRuntimeDiagnosticSeverity(category: ts.DiagnosticCategory): RuntimeFilesystemDiagnosticSeverity {
  switch (category) {
    case ts.DiagnosticCategory.Warning:
      return 'warning';
    case ts.DiagnosticCategory.Suggestion:
      return 'hint';
    case ts.DiagnosticCategory.Message:
      return 'info';
    case ts.DiagnosticCategory.Error:
    default:
      return 'error';
  }
}
