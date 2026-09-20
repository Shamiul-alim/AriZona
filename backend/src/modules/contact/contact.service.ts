import { Injectable } from '@nestjs/common';
import { ContactStatus, Prisma } from '@prisma/client';
import { paginate } from 'src/common/dto/pagination.dto';
import { sha256 } from 'src/common/utils/crypto.util';
import { sanitizePlainText } from 'src/common/utils/sanitize.util';
import { AppConfigService } from 'src/config/app-config.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateContactDto, UpdateContactDto } from './dto/contact.dto';

@Injectable()
export class ContactService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async create(dto: CreateContactDto, ip?: string) {
    const message = await this.prisma.contactMessage.create({
      data: {
        name: sanitizePlainText(dto.name),
        email: dto.email.toLowerCase(),
        subject: sanitizePlainText(dto.subject),
        category: dto.category,
        message: sanitizePlainText(dto.message),
        // Hashed so repeat submissions can be correlated without retaining IPs.
        ipHash: ip ? sha256(`${ip}:${this.config.values.media.signingSecret}`) : null,
      },
    });
    return { id: message.id, status: message.status };
  }

  async list(status: ContactStatus | undefined, page: number, limit: number) {
    const where: Prisma.ContactMessageWhereInput = status ? { status } : {};
    const [data, total] = await this.prisma.$transaction([
      this.prisma.contactMessage.findMany({
        where,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.contactMessage.count({ where }),
    ]);
    return paginate(data, total, page, limit);
  }

  update(id: string, dto: UpdateContactDto) {
    return this.prisma.contactMessage.update({
      where: { id },
      data: { status: dto.status, ...(dto.adminNote !== undefined ? { adminNote: dto.adminNote } : {}) },
    });
  }

  async counts() {
    const grouped = await this.prisma.contactMessage.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const base = Object.fromEntries(
      Object.values(ContactStatus).map((s) => [s, 0]),
    ) as Record<ContactStatus, number>;
    for (const row of grouped) base[row.status] = row._count._all;
    return base;
  }
}
