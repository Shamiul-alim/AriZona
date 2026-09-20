import { Module, Provider } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AppConfigService } from 'src/config/app-config.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleOAuthGuard } from './google-oauth.guard';
import { GoogleStrategy } from './strategies/google.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TokenService } from './token.service';

/**
 * GoogleStrategy is only instantiated when the operator has supplied their own
 * OAuth client. Registering it unconditionally would crash the app at boot with
 * "OAuth2Strategy requires a clientID option".
 */
const googleProvider: Provider = {
  provide: GoogleStrategy,
  inject: [AppConfigService],
  useFactory: (config: AppConfigService) =>
    config.values.googleOAuth.enabled ? new GoogleStrategy(config) : null,
};

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt', session: false }),
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenService, JwtStrategy, googleProvider, GoogleOAuthGuard],
  exports: [AuthService, TokenService],
})
export class AuthModule {}
