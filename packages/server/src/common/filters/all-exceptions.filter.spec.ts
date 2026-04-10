import {
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { createErrorResponse } from '../http/api-response';
import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  it('maps HttpException to { code, message, data:null } with same status/code', () => {
    const response = createResponseStub();
    const host = createArgumentsHost(response);

    filter.catch(
      new HttpException('route missing', HttpStatus.NOT_FOUND),
      host,
    );

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({
      code: 404,
      message: 'route missing',
      data: null,
    });
  });

  it('normalizes ValidationPipe array messages', () => {
    const response = createResponseStub();
    const host = createArgumentsHost(response);

    filter.catch(
      new BadRequestException([
        'username must be longer than or equal to 3 characters',
        'password must be longer than or equal to 8 characters',
      ]),
      host,
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      code: 400,
      message:
        'username must be longer than or equal to 3 characters; password must be longer than or equal to 8 characters',
      data: null,
    });
  });

  it('uses HttpException status as error code even if response body contains another code', () => {
    const response = createResponseStub();
    const host = createArgumentsHost(response);

    filter.catch(
      new HttpException(
        createErrorResponse(9999, 'plugin validation failed'),
        HttpStatus.CONFLICT,
      ),
      host,
    );

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith({
      code: 409,
      message: 'plugin validation failed',
      data: null,
    });
  });

  it('falls back to status default message for non-string HttpException payloads', () => {
    const response = createResponseStub();
    const host = createArgumentsHost(response);

    filter.catch(
      new HttpException(123 as never, HttpStatus.BAD_REQUEST),
      host,
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      code: 400,
      message: 'Bad Request',
      data: null,
    });
  });

  it('maps generic Error to internal server envelope', () => {
    const response = createResponseStub();
    const host = createArgumentsHost(response);

    filter.catch(new Error('db is down'), host);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      code: 500,
      message: 'db is down',
      data: null,
    });
  });
});

function createArgumentsHost(response: ResponseStub): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getResponse: () => response,
    }),
  } as ArgumentsHost;
}

function createResponseStub(): ResponseStub {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
}

interface ResponseStub {
  status: jest.Mock;
  json: jest.Mock;
}

