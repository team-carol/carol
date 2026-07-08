import {
  EmbedBuilder, MessageFlags, ChatInputCommandInteraction,
  PermissionsBitField, GuildMember,
} from "discord.js";
import { getCachedProfile, loadUserSession, getGuildSetting } from "../../db";

export const RATING_ROLES: [number, string, number][] = [
  [16750, "무지개(극) IV",  0xab30ff],
  [16500, "무지개(극) III", 0x9b20ff],
  [16250, "무지개(극) II",  0x8b10ff],
  [16000, "무지개(극) I",   0x7b00ef],
  [15750, "무지개 IV",      0xbb70ff],
  [15500, "무지개 III",     0xab50ff],
  [15250, "무지개 II",      0x9b30ff],
  [15000, "무지개 I",       0x8b00ff],
  [14750, "백금 II",        0xd4d4d4],
  [14500, "백금 I",         0xe0e0e0],
  [14250, "금 II",          0xefc600],
  [14000, "금 I",           0xffd700],
  [13000, "은",             0x8c8c8c],
  [12000, "동",             0xcd7f32],
  [10000, "보라",           0xbd5dc7],
  [6000,  "파랑",           0x4d9eea],
  [2000,  "청동",           0x95a5a6],
];

export const tierPrefixes = ["무지개", "백금", "금", "은", "동", "보라", "파랑", "청동", "MAIMAI "];

export function ratingRoleName(r: number): { name: string; color: number } | null {
  for (const [min, name, color] of RATING_ROLES) {
    if (r >= min) return { name, color };
  }
  return null;
}

export function ratingColor(r: number): number {
  return ratingRoleName(r)?.color ?? 0x95a5a6;
}

export async function handleRole(interaction: ChatInputCommandInteraction, userId: string): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "서버에서만 사용 가능합니다.", flags: MessageFlags.Ephemeral });
    return;
  }
  const botMember = interaction.guild.members.me;
  if (!botMember?.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    await interaction.reply({ content: "봇에 '역할 관리' 권한이 필요합니다.", flags: MessageFlags.Ephemeral });
    return;
  }
  const stored = loadUserSession(userId);
  if (!stored?.friendCode) {
    await interaction.reply({ content: "먼저 `/북마클릿`으로 프로필을 등록해주세요.", flags: MessageFlags.Ephemeral });
    return;
  }
  const cached = getCachedProfile(stored.friendCode);
  if (!cached) {
    await interaction.reply({ content: "프로필 데이터가 없습니다. `/북마클릿`으로 동기화해주세요.", flags: MessageFlags.Ephemeral });
    return;
  }
  const roleInfo = ratingRoleName(cached.rating);
  if (!roleInfo) {
    await interaction.reply({ content: "레이팅이 2000 미만이라 역할이 부여되지 않습니다.", flags: MessageFlags.Ephemeral });
    return;
  }
  const member = interaction.member as GuildMember;
  if (!member) {
    await interaction.reply({ content: "멤버 정보를 불러올 수 없습니다.", flags: MessageFlags.Ephemeral });
    return;
  }

  try {
    const oldRoles = member.roles.cache.filter((r) => tierPrefixes.some((p) => r.name.startsWith(p)));
    if (oldRoles.size > 0) await member.roles.remove(oldRoles);

    let targetRole = interaction.guild.roles.cache.find((r) => r.name === roleInfo.name);
    if (!targetRole) {
      targetRole = await interaction.guild.roles.create({
        name: roleInfo.name, colors: { primaryColor: roleInfo.color }, reason: "maimai 레이팅 자동 역할",
      });
    } else if (targetRole.colors.primaryColor !== roleInfo.color) {
      await targetRole.setColors({ primaryColor: roleInfo.color });
    }

    if (targetRole.position >= botMember.roles.highest.position) {
      await interaction.reply({
        content: `"${roleInfo.name}" 역할이 봇보다 높거나 같아서 부여할 수 없습니다. 관리자가 역할 순서를 조정해주세요.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const allTierRoles = interaction.guild.roles.cache.filter((r) => tierPrefixes.some((p) => r.name.startsWith(p)));
    await member.roles.remove(allTierRoles);
    await member.roles.add(targetRole);

    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(roleInfo.color)
        .setDescription(`레이팅 **${cached.rating}** → **${roleInfo.name}** 역할 부여 완료!`)],
      flags: MessageFlags.Ephemeral,
    });
  } catch (e: any) {
    console.error("[role]", e);
    await interaction.reply({
      content: `역할 부여 실패: ${e.message ?? "알 수 없는 오류"}`,
      flags: MessageFlags.Ephemeral,
    });
  }
}

export function autoRole(interaction: ChatInputCommandInteraction, rating: number): void {
  if (!interaction.guild) return;
  if (!getGuildSetting(interaction.guild.id)) return;
  const botMember = interaction.guild.members.me;
  if (!botMember?.permissions.has(PermissionsBitField.Flags.ManageRoles)) return;
  const roleInfo = ratingRoleName(rating);
  if (!roleInfo) return;
  const member = interaction.member as GuildMember;
  if (!member) return;

  (async () => {
    const guild = interaction.guild!;
    const allTierRoles = guild.roles.cache.filter((r) => tierPrefixes.some((p) => r.name.startsWith(p)));
    await member.roles.remove(allTierRoles);
    let targetRole = guild.roles.cache.find((r) => r.name === roleInfo.name);
    if (!targetRole) {
      targetRole = await guild.roles.create({ name: roleInfo.name, colors: { primaryColor: roleInfo.color }, reason: "maimai 레이팅 자동 역할" });
    }
    if (targetRole.position < botMember.roles.highest.position) {
      await member.roles.add(targetRole);
    }
  })().catch((e) => console.error("[auto-role]", e));
}
