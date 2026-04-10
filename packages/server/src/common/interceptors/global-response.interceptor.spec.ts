import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import {
  createSuccessResponse,
} from '../http/api-response';
import { GlobalResponseInterceptor } from './global-response.interceptor';

describe('GlobalResponseInterceptor', () => {
  const interceptor = new GlobalResponseInterceptor();

  it('wraps normal http payload as { code: 0, message: "", data }', async () => {
    const response = createResponseStub({
      statusCode: 200,
    });
    const context = createHttpExecutionContext(response);
    const payload = {
      id: 'user-1',
    };

    const result = await firstValueFrom(
      interceptor.intercept(context, createHandler(payload)),
    );

    expect(result).toEqual({
      code: 0,
      message: '',
      data: {
        id: 'user-1',
      },
    });
  });

  it('maps http error status to error envelope instead of forcing code=0', async () => {
    const response = createResponseStub({
      statusCode: 404,
    });
    const context = createHttpExecutionContext(response);
    const payload = {
      message: 'Plugin route not found',
      detail: 'missing manifest route',
    };

    const result = await firstValueFrom(
      interceptor.intercept(context, createHandler(payload)),
    );

    expect(result).toEqual({
      code: 404,
      message: 'Plugin route not found',
      data: null,
    });
  });

  it('uses status-code fallback message when error payload has no message', async () => {
    const response = createResponseStub({
      statusCode: 422,
    });
    const context = createHttpExecutionContext(response);

    const result = await firstValueFrom(
      interceptor.intercept(context, createHandler({ reason: 'invalid dto' })),
    );

    expect(result).toEqual({
      code: 422,
      message: 'Unprocessable Entity',
      data: null,
    });
  });

  it('keeps already-standard responses unchanged', async () => {
    const response = createResponseStub({
      statusCode: 200,
    });
    const context = createHttpExecutionContext(response);
    const payload = createSuccessResponse({
      accessToken: 'token-1',
      refreshToken: 'token-2',
    });

    const result = await firstValueFrom(
      interceptor.intercept(context, createHandler(payload)),
    );

    expect(result).toBe(payload);
  });

  it('keeps SSE payload untouched so event stream is not envelope-wrapped', async () => {
    const response = createResponseStub({
      statusCode: 200,
      contentType: 'text/event-stream',
    });
    const context = createHttpExecutionContext(response);
    const payload = undefined;

    const result = await firstValueFrom(
      interceptor.intercept(context, createHandler(payload)),
    );

    expect(result).toBeUndefined();
  });

  it('bypasses non-http execution contexts', async () => {
    const response = createResponseStub({
      statusCode: 200,
    });
    const context = createExecutionContext('ws', response);
    const payload = {
      source: 'gateway',
    };

    const result = await firstValueFrom(
      interceptor.intercept(context, createHandler(payload)),
    );

    expect(result).toEqual({
      source: 'gateway',
    });
  });
});

function createHandler<T>(payload: T): CallHandler<T> {
  return {
    handle: () => of(payload),
  };
}

function createHttpExecutionContext(
  response: ResponseStub,
): ExecutionContext {
  return createExecutionContext('http', response);
}

function createExecutionContext(
  contextType: 'http' | 'ws' | 'rpc',
  response: ResponseStub,
): ExecutionContext {
  return {
    getType: () => contextType,
    switchToHttp: () => ({
      getResponse: () => response,
    }),
  } as ExecutionContext;
}

function createResponseStub(input: {
  statusCode: number;
  contentType?: string;
}): ResponseStub {
  return {
    statusCode: input.statusCode,
    getHeader: (name: string): string | undefined => {
      if (name.toLowerCase() !== 'content-type') {
        return undefined;
      }
      return input.contentType;
    },
  };
}

interface ResponseStub {
  statusCode: number;
  getHeader(name: string): string | undefined;
}
