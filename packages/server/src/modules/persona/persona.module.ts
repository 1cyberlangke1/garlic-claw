import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { HostModule } from '../runtime/host/host.module';
import { PersonaController } from './persona.controller';

@Module({
  imports: [AuthModule, HostModule],
  controllers: [PersonaController],
})
export class PersonaModule {}
