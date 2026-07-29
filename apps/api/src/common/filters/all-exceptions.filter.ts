import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Error as MongooseError, mongo } from 'mongoose';
import { getRequestId } from '../context/request-context';
import { DomainException } from '../errors/domain.exception';
import {
  ErrorCode,
  type ErrorCodeValue,
  type ErrorEnvelope,
} from '../errors/error-codes';

/**
 * The one place an error becomes a response.
 *
 * Every failure — thrown deliberately by us, raised by Mongoose, or entirely
 * unexpected — leaves through here and exits in the same envelope. A client that can
 * parse one error can parse all of them.
 *
 * Registered via `APP_FILTER` rather than `app.useGlobalFilters()` so it stays inside
 * the DI container and can be given a real logger.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, code, message, details } = this.translate(exception);
    const requestId = getRequestId();

    const envelope: ErrorEnvelope = {
      statusCode: status,
      code,
      message,
      ...(details ? { details } : {}),
      path: request.originalUrl,
      timestamp: new Date().toISOString(),
      requestId,
    };

    // 5xx means we did something wrong, so log the real error with a stack. 4xx is
    // the client being told "no", which is routine — log it at debug so a scripted
    // scanner cannot flood the logs.
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.originalUrl} -> ${status} [${requestId}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.debug(
        `${request.method} ${request.originalUrl} -> ${status} ${code}`,
      );
    }

    if (
      status === HttpStatus.TOO_MANY_REQUESTS &&
      !response.getHeader('Retry-After')
    ) {
      response.setHeader('Retry-After', '60');
    }

    response.status(status).json(envelope);
  }

  private translate(exception: unknown): {
    status: HttpStatus;
    code: ErrorCodeValue;
    message: string;
    details?: ErrorEnvelope['details'];
  } {
    // 1. Our own exceptions already know exactly what they are.
    if (exception instanceof DomainException) {
      return {
        status: exception.getStatus(),
        code: exception.code,
        message: exception.message,
      };
    }

    if (exception instanceof ThrottlerException) {
      return {
        status: HttpStatus.TOO_MANY_REQUESTS,
        code: ErrorCode.RATE_LIMITED,
        message: 'Too many requests. Please wait a moment and try again.',
      };
    }

    // 2. ValidationPipe failures arrive as a BadRequestException whose payload holds
    //    the class-validator messages. Flatten them into a typed `details` array so
    //    the mobile client can map an error onto the exact form field.
    if (exception instanceof HttpException) {
      // Annotated, not asserted: `getStatus()` returns `number`, and an `as HttpStatus`
      // assertion gets stripped by eslint --fix as "unnecessary" (TS allows number ->
      // numeric enum), which reintroduces the unsafe-enum-comparison error below.
      const status: HttpStatus = exception.getStatus();
      const payload = exception.getResponse();

      if (
        status === HttpStatus.BAD_REQUEST &&
        typeof payload === 'object' &&
        payload !== null
      ) {
        const raw = (payload as { message?: unknown }).message;
        if (Array.isArray(raw)) {
          return {
            status,
            code: ErrorCode.VALIDATION_FAILED,
            message: 'Validation failed',
            details: raw.map((m) => this.parseValidationMessage(String(m))),
          };
        }
      }

      const message =
        typeof payload === 'string'
          ? payload
          : ((payload as { message?: string }).message ?? exception.message);

      return { status, code: this.codeForStatus(status), message };
    }

    // 3. Bad ObjectId in a path parameter — a client mistake, not a server fault.
    if (exception instanceof MongooseError.CastError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        code: ErrorCode.INVALID_ID,
        message: `Malformed identifier for '${exception.path}'`,
      };
    }

    if (exception instanceof MongooseError.ValidationError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        code: ErrorCode.VALIDATION_FAILED,
        message: 'Validation failed',
        details: Object.entries(exception.errors).map(([field, e]) => ({
          field,
          constraint: e.message,
        })),
      };
    }

    // 4. Unique-index violation. Reported as 409 rather than 500 — the request was
    //    well-formed, it just lost a race or repeated an existing value.
    if (
      exception instanceof mongo.MongoServerError &&
      exception.code === 11000
    ) {
      return {
        status: HttpStatus.CONFLICT,
        code: ErrorCode.DUPLICATE_RESOURCE,
        message: 'That value is already taken',
      };
    }

    // 6. Anything else is a bug. Say nothing: the message could name a collection, a
    //    file path, or a connection string. It is logged in full against the requestId.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.INTERNAL_ERROR,
      message: 'An unexpected error occurred',
    };
  }

  /** class-validator emits "email must be an email"; recover the field name from it. */
  private parseValidationMessage(message: string): {
    field: string;
    constraint: string;
  } {
    const field = message.split(' ')[0] ?? 'unknown';
    return { field, constraint: message };
  }

  private codeForStatus(status: HttpStatus): ErrorCodeValue {
    switch (status) {
      case HttpStatus.UNAUTHORIZED:
        return ErrorCode.AUTH_TOKEN_INVALID;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ErrorCode.RATE_LIMITED;
      case HttpStatus.CONFLICT:
        return ErrorCode.DUPLICATE_RESOURCE;
      case HttpStatus.BAD_REQUEST:
        return ErrorCode.VALIDATION_FAILED;
      case HttpStatus.NOT_FOUND:
        return ErrorCode.NOT_FOUND;
      default:
        return ErrorCode.INTERNAL_ERROR;
    }
  }
}
