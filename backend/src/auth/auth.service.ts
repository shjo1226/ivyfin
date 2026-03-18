import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { SignupDto, LoginDto, GuestRegisterDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async signup(dto: SignupDto) {
    if (!dto.privacyConsent) {
      throw new BadRequestException('개인정보 수집 동의가 필요합니다.');
    }

    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: dto.email }, { phone: dto.phone }],
      },
    });

    if (existingUser) {
      throw new ConflictException('이미 등록된 이메일 또는 전화번호입니다.');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        phone: dto.phone,
        email: dto.email,
        password: hashedPassword,
        privacyConsent: dto.privacyConsent,
        isGuest: false,
      },
    });

    const token = this.jwtService.sign({ sub: user.id, email: user.email });

    return {
      accessToken: token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        birthDate: user.birthDate,
        gender: user.gender,
        isGuest: user.isGuest,
      },
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || !user.password) {
      throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다.');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다.');
    }

    const token = this.jwtService.sign({ sub: user.id, email: user.email });

    return {
      accessToken: token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        birthDate: user.birthDate,
        gender: user.gender,
        isGuest: user.isGuest,
      },
    };
  }

  async guestRegister(dto: GuestRegisterDto) {
    if (!dto.privacyConsent) {
      throw new BadRequestException('개인정보 수집 동의가 필요합니다.');
    }

    // Check if guest already exists with same phone
    let user = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });

    if (user) {
      // If user exists and is a guest, just return token
      if (user.isGuest) {
        const token = this.jwtService.sign({ sub: user.id });
        return {
          accessToken: token,
          user: {
            id: user.id,
            name: user.name,
            phone: user.phone,
            birthDate: user.birthDate,
            gender: user.gender,
            isGuest: user.isGuest,
          },
        };
      }
      throw new ConflictException('이미 회원으로 등록된 전화번호입니다. 로그인해주세요.');
    }

    user = await this.prisma.user.create({
      data: {
        name: dto.name,
        phone: dto.phone,
        birthDate: dto.birthDate,
        gender: dto.gender,
        privacyConsent: dto.privacyConsent,
        isGuest: true,
      },
    });

    const token = this.jwtService.sign({ sub: user.id });

    return {
      accessToken: token,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        birthDate: user.birthDate,
        gender: user.gender,
        isGuest: user.isGuest,
      },
    };
  }

  async validateUser(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        isGuest: true,
        birthDate: true,
        gender: true,
      },
    });
  }
}
