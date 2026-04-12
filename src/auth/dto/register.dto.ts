import { IsEmail, IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  full_name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[A-Z])(?=.*\d).+$/, {
    message:
      'A senha deve ter no mínimo 8 caracteres, uma letra maiúscula e um número.',
  })
  password: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  organization_name: string;
}
