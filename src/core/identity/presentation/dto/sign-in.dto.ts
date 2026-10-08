import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { EMAIL_MAX_LENGTH } from '../../domain/rules/email.ts';
import { PASSWORD_MAX_LENGTH } from '../../domain/rules/password-policy.ts';

export namespace SignIn {
    @ApiSchema({ name: 'SignIn-AdminPanelRequest' })
    export class AdminPanelRequest {
        @ApiProperty({ example: 'admin@example.com' })
        @IsEmail()
        @MaxLength(EMAIL_MAX_LENGTH)
        email: string;

        @ApiProperty({ maxLength: PASSWORD_MAX_LENGTH })
        @IsString()
        @MinLength(1)
        @MaxLength(PASSWORD_MAX_LENGTH)
        password: string;
    }
}
