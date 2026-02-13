import { Controller, Get, Inject, Post, Query, Req, Res } from '@nestjs/common';
import { IsString } from 'class-validator';
import type { FastifyReply } from 'fastify';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';
import { CurrentPrincipal } from './principal.decorator';
import type { AuthStatusResponse, Principal, RequestWithPrincipal } from './auth.types';

class OidcCallbackQueryDto {
  @IsString()
  state!: string;

  @IsString()
  code!: string;
}

@Controller('api/auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Get('status')
  @Public()
  async status(@CurrentPrincipal() principal: Principal | null): Promise<AuthStatusResponse> {
    return this.auth.getAuthStatus(principal);
  }

  @Get('login')
  @Public()
  async login(@Res({ passthrough: true }) reply: FastifyReply): Promise<void> {
    await this.auth.initiateLogin(reply);
  }

  @Get('oidc/callback')
  @Public()
  async callback(@Query() query: OidcCallbackQueryDto, @Res({ passthrough: true }) reply: FastifyReply): Promise<void> {
    await this.auth.handleOidcCallback(query, reply);
  }

  @Post('logout')
  async logout(@Req() request: RequestWithPrincipal, @Res({ passthrough: true }) reply: FastifyReply): Promise<void> {
    await this.auth.logout(reply, request.sessionId ?? null);
  }
}
