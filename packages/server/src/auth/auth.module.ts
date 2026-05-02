import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { BootstrapUserService } from './bootstrap-user.service';
import { JwtAuthGuard } from './http-auth';
import { RequestAuthService } from './request-auth.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    BootstrapUserService,
    JwtAuthGuard,
    RequestAuthService,
  ],
  exports: [
    BootstrapUserService,
    JwtAuthGuard,
    RequestAuthService,
  ],
})
export class AuthModule {}
