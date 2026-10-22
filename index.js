const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('Bot 7/24 Aktif!'));
app.listen(process.env.PORT || 10000, () => console.log('Web sunucusu hazır!'));

const { 
    Client, 
    GatewayIntentBits, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ChannelType, 
    PermissionFlagsBits, 
    EmbedBuilder,
    REST,
    Routes,
    SlashCommandBuilder,
    Collection
} = require('discord.js');
require('dotenv').config();
const Database = require('better-sqlite3');

// Veritabanı Kurulumu (Sestop İçin)
const db = new Database('voice_stats.db');
db.exec(`CREATE TABLE IF NOT EXISTS voice_times (
    user_id TEXT PRIMARY KEY,
    total_time INTEGER DEFAULT 0
)`);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildInvites
    ]
});

// ==========================================
// --- AYARLAR (Kendi ID'lerinle Doldur) ---
// ==========================================
const HOŞGELDIN_KANAL_ID = "1561114090250707034"; 
const OTO_ROL_ID = "1522564705434996746";         

const TICKET_KANAL_ID = "1561114682121519194"; 
const TICKET_KATEGORI_ID = "1561118040160993422"; 
const YETKILI_ROL_ID = "1522617208134435027";  

const PARTNER_KANAL_ID = "1561115598128291861"; // <--- Yeni eklendi!

// Hafıza Yönetimi
const activeGiveaways = new Map();
const voiceJoinTimes = new Map();
const guildInvites = new Collection();

// --- SLASH KOMUTLARINI TANIMLAMA ---
const commands = [
    new SlashCommandBuilder()
        .setName('çekiliş')
        .setDescription('Sunucuda çekiliş başlatır')
        .addStringOption(option => 
            option.setName('süre').setDescription('Süre (Örn: 10s, 5m, 1h)').setRequired(true))
        .addStringOption(option => 
            option.setName('ödül').setDescription('Çekiliş ödülü nedir?').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('sestop')
        .setDescription('Ses kanallarında en çok duran ilk 10 kişiyi listeler'),

    new SlashCommandBuilder()
        .setName('sil')
        .setDescription('Kanaldan belirtilen miktarda mesaj siler (1-100).')
        .addIntegerOption(option => 
            option.setName('miktar')
                .setDescription('Silinecek mesaj sayısı (1-100)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(100))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    new SlashCommandBuilder()
        .setName('invites')
        .setDescription('Sizin veya belirttiğiniz üyenin davet istatistiklerini gösterir.')
        .addUserOption(option => 
            option.setName('kullanıcı').setDescription('Davet sayısına bakılacak üye').setRequired(false))
].map(command => command.toJSON());

// --- BOT AÇILDIGINDA ÇALIŞACAK KISIM ---
client.once('ready', async () => {
    console.log(`🚀 Bot ${client.user.tag} olarak tüm sistemleriyle aktif!`);
    client.user.setActivity('İstiklal Mahkemelerinde Çalışıyor');

    // Davetleri Hafızaya Alma
    client.guilds.cache.forEach(async (guild) => {
        try {
            const firstInvites = await guild.invites.fetch();
            guildInvites.set(guild.id, new Collection(firstInvites.map((invite) => [invite.code, invite.uses])));
        } catch (err) {
            console.error(`[Davet Hata] ${guild.name} davetleri çekilemedi:`, err.message);
        }
    });

    // AutoMod Kurulumu
    try {
        const guild = client.guilds.cache.first();
        if (guild) {
            const rules = await guild.autoModerationRules.fetch();
            const ruleExists = rules.some(r => r.name === 'Otomatik Küfür Filtresi');

            if (!ruleExists) {
                await guild.autoModerationRules.create({
                    name: 'Otomatik Küfür Filtresi',
                    creatorId: client.user.id,
                    enabled: true,
                    eventType: 1,
                    triggerType: 4,
                    triggerMetadata: { presets: [1] },
                    actions: [{ type: 1 }]
                });
                console.log('🛡️ Otomatik Küfür Filtresi kuruldu!');
            }
        }
    } catch (err) {
        console.error('AutoMod hatası:', err.message);
    }

    // Slash Komutlarını Discord'a Yükleme
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );
        console.log('✨ Slash komutları yüklendi!');
    } catch (error) {
        console.error("Komut yükleme hatası:", error);
    }

    // Ticket Panelini Otomatik Gönderme
    const ticketKanal = client.channels.cache.get(TICKET_KANAL_ID);
    if (ticketKanal) {
        const messages = await ticketKanal.messages.fetch({ limit: 10 });
        if (messages.size === 0) {
            const embed = new EmbedBuilder()
                .setTitle("🩸 Destek & Başvuru Merkezi")
                .setDescription("Lütfen açmak istediğiniz talep türünü aşağıdaki butonlardan seçiniz. Yetkililerimiz en kısa sürede ilgilenecektir.")
                .setColor("#8B0000");

            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ticket_ekipalim').setLabel('Ekip Alım').setEmoji('🤝').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('ticket_partnerlik').setLabel('Partnerlik').setEmoji('🌐').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('ticket_reklam').setLabel('Reklam').setEmoji('📢').setStyle(ButtonStyle.Secondary)
            );

            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ticket_merge').setLabel('Merge / Ally').setEmoji('🔗').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('ticket_genel').setLabel('Genel Destek').setEmoji('📩').setStyle(ButtonStyle.Danger)
            );

            await ticketKanal.send({ embeds: [embed], components: [row1, row2] });
        }
    }
});

client.on('inviteCreate', async (invite) => {
    const invites = await invite.guild.invites.fetch();
    const codeUses = new Collection();
    invites.forEach((inv) => codeUses.set(inv.code, inv.uses));
    guildInvites.set(invite.guild.id, codeUses);
});

// --- WELCOMER & OTO-ROL SİSTEMİ ---
client.on('guildMemberAdd', async (member) => {
    const rol = member.guild.roles.cache.get(OTO_ROL_ID);
    if (rol) member.roles.add(rol).catch(console.error);

    const cachedInvites = guildInvites.get(member.guild.id);
    const newInvites = await member.guild.invites.fetch();
    
    let davetEden = "Bilinmiyor / Özel Davet";
    const usedInvite = newInvites.find((inv) => cachedInvites && cachedInvites.get(inv.code) < inv.uses);

    if (usedInvite && usedInvite.inviter) {
        davetEden = usedInvite.inviter.tag;
    }

    const codeUses = new Collection();
    newInvites.forEach((inv) => codeUses.set(inv.code, inv.uses));
    guildInvites.set(member.guild.id, codeUses);

    const kanal = member.guild.channels.cache.get(HOŞGELDIN_KANAL_ID);
    if (kanal) {
        kanal.send(`🎉 Sunucumuza hoş geldin ${member}! Seni davet eden: **${davetEden}** | Seninle beraber **${member.guild.memberCount}** kişi olduk!`);
    }
});

client.on('guildMemberRemove', async (member) => {
    const kanal = member.guild.channels.cache.get(HOŞGELDIN_KANAL_ID);
    if (kanal) {
        const kullaniciAdi = member.user ? member.user.displayName : "Bir üye";
        kanal.send(`📤 **${kullaniciAdi}** sunucumuzdan ayrıldı. Kalan kişi sayısı: **${member.guild.memberCount}**.`);
    }
});

// --- SESTOP ---
client.on('voiceStateUpdate', (oldState, newState) => {
    const userId = newState.member.id;

    if (!oldState.channelId && newState.channelId) {
        voiceJoinTimes.set(userId, Date.now());
    }

    if (oldState.channelId && !newState.channelId) {
        const joinTime = voiceJoinTimes.get(userId);
        if (joinTime) {
            const duration = Math.floor((Date.now() - joinTime) / 1000);
            voiceJoinTimes.delete(userId);

            const row = db.prepare(`SELECT total_time FROM voice_times WHERE user_id = ?`).get(userId);
            if (row) {
                db.prepare(`UPDATE voice_times SET total_time = total_time + ? WHERE user_id = ?`).run(duration, userId);
            } else {
                db.prepare(`INSERT INTO voice_times (user_id, total_time) VALUES (?, ?)`).run(userId, duration);
            }
        }
    }
});

// --- INTERACTION HANDLER ---
client.on('interactionCreate', async (interaction) => {
    
    // A) SLASH KOMUTLARI
    if (interaction.isChatInputCommand()) {

        if (interaction.commandName === 'invites') {
            await interaction.deferReply();
            const targetUser = interaction.options.getUser('kullanıcı') || interaction.user;

            try {
                const userInvites = await interaction.guild.invites.fetch();
                const filteredInvites = userInvites.filter(inv => inv.inviter && inv.inviter.id === targetUser.id);

                let toplamDavet = 0;
                filteredInvites.forEach(inv => { toplamDavet += inv.uses; });

                const embed = new EmbedBuilder()
                    .setTitle(`🩸 Davet İstatistikleri`)
                    .setDescription(`${targetUser} kullanıcısının davet bilgileri:`)
                    .addFields({ name: '📩 Toplam Davet Sayısı', value: `**${toplamDavet}** kişi`, inline: true })
                    .setColor("#8B0000")
                    .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }));

                await interaction.editReply({ embeds: [embed] });
            } catch (err) {
                console.error("Davet hatası:", err);
                await interaction.editReply("Davet bilgileri çekilirken bir hata oluştu.");
            }
        }

        if (interaction.commandName === 'sil') {
            const miktar = interaction.options.getInteger('miktar');
            try {
                const deletedMessages = await interaction.channel.bulkDelete(miktar, true);
                await interaction.reply({ content: `🗑️ **${deletedMessages.size}** adet mesaj silindi.`, ephemeral: true });
            } catch (err) {
                await interaction.reply({ content: '❌ Mesajlar silinirken hata oluştu.', ephemeral: true });
            }
        }

        if (interaction.commandName === 'çekiliş') {
            const sureStr = interaction.options.getString('süre');
            const odul = interaction.options.getString('ödül');

            let ms = 0;
            if (sureStr.endsWith('s')) ms = parseInt(sureStr) * 1000;
            else if (sureStr.endsWith('m')) ms = parseInt(sureStr) * 60 * 1000;
            else if (sureStr.endsWith('h')) ms = parseInt(sureStr) * 60 * 60 * 1000;
            else return interaction.reply({ content: 'Geçersiz süre! Örn: `10s`, `5m`, `1h`', ephemeral: true });

            const bitisZamani = Math.floor((Date.now() + ms) / 1000);

            const embed = new EmbedBuilder()
                .setTitle("🎉 ÇEKİLİŞ BAŞLADI! 🎉")
                .setDescription(`Ödül: **${odul}**\nBitiş: <t:${bitisZamani}:R>\n\nKatılmak için aşağıdaki 🎉 butonuna basın!`)
                .setColor("#8B0000");

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('giveaway_join').setLabel('Katıl (0)').setEmoji('🎉').setStyle(ButtonStyle.Danger)
            );

            await interaction.reply({ content: "Çekiliş başlatıldı!", ephemeral: true });
            const mesaj = await interaction.channel.send({ embeds: [embed], components: [row] });

            const katilimcilar = new Set();
            activeGiveaways.set(mesaj.id, katilimcilar);

            setTimeout(async () => {
                activeGiveaways.delete(mesaj.id);
                const kazananlarListesi = Array.from(katilimcilar);

                if (kazananlarListesi.length === 0) {
                    return mesaj.edit({ content: `🎉 Çekiliş bitti: **${odul}**\nKatılım olmadı!`, components: [] });
                }

                const kazananID = kazananlarListesi[Math.floor(Math.random() * kazananlarListesi.length)];
                const kazananEmbed = new EmbedBuilder()
                    .setTitle("🎉 ÇEKİLİŞ SONUÇLANDI 🎉")
                    .setDescription(`Ödül: **${odul}**\n🏆 Kazanan: <@${kazananID}>! Tebrikler!`)
                    .setColor("#8B0000");

                await mesaj.edit({ embeds: [kazananEmbed], components: [] });
                await mesaj.reply(`Tebrikler <@${kazananID}>! **${odul}** kazandın! 🥳`);
            }, ms);
        }

        if (interaction.commandName === 'sestop') {
            await interaction.deferReply();
            const rows = db.prepare(`SELECT user_id, total_time FROM voice_times ORDER BY total_time DESC LIMIT 10`).all();

            if (!rows || rows.length === 0) return interaction.editReply("Henüz ses verisi kaydedilmemiş!");

            let listeMetni = "";
            let sira = 1;
            for (const row of rows) {
                const user = await client.users.fetch(row.user_id).catch(() => null);
                const userName = user ? user.tag : "Bilinmeyen Üye";
                const saat = Math.floor(row.total_time / 3600);
                const dakika = Math.floor((row.total_time % 3600) / 60);
                const saniye = row.total_time % 60;
                const sureYazisi = `${saat > 0 ? `${saat}s ` : ''}${dakika > 0 ? `${dakika}d ` : ''}${saniye}sn`;
                const madalya = sira === 1 ? '🥇' : sira === 2 ? '🥈' : sira === 3 ? '🥉' : '🔹';
                listeMetni += `${madalya} **${sira}.** ${userName} — **${sureYazisi}**\n`;
                sira++;
            }

            const embed = new EmbedBuilder()
                .setTitle("🎙️ Ses Sıralaması (Top 10)")
                .setDescription(listeMetni)
                .setColor("#8B0000");

            await interaction.editReply({ embeds: [embed] });
        }
    }

    // B) BUTON ETKİLEŞİMLERİ (Ticket, Çekiliş & Partnerlik Onay)
    if (!interaction.isButton()) return;

    // Çekilişe Katılma
    if (interaction.customId === 'giveaway_join') {
        const katilimcilar = activeGiveaways.get(interaction.message.id);
        if (!katilimcilar) return interaction.reply({ content: 'Bu çekiliş sona ermiş!', ephemeral: true });

        if (katilimcilar.has(interaction.user.id)) {
            katilimcilar.delete(interaction.user.id);
            const yeniRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('giveaway_join').setLabel(`Katıl (${katilimcilar.size})`).setEmoji('🎉').setStyle(ButtonStyle.Danger)
            );
            await interaction.message.edit({ components: [yeniRow] });
            return interaction.reply({ content: 'Çekilişten ayrıldın.', ephemeral: true });
        } else {
            katilimcilar.add(interaction.user.id);
            const yeniRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('giveaway_join').setLabel(`Katıl (${katilimcilar.size})`).setEmoji('🎉').setStyle(ButtonStyle.Danger)
            );
            await interaction.message.edit({ components: [yeniRow] });
            return interaction.reply({ content: 'Çekilişe başarıyla katıldın! 🍀', ephemeral: true });
        }
    }

    // PARTNERLİK ONAYLAMA (Siyah Buton)
    if (interaction.customId === 'partner_onayla') {
        await interaction.deferReply({ ephemeral: true });

        const partnerKanal = interaction.guild.channels.cache.get(PARTNER_KANAL_ID);
        if (!partnerKanal) {
            return interaction.editReply({ content: "❌ Partnerlik kanalı bulunamadı! Lütfen `PARTNER_KANAL_ID` değişkenini kontrol edin." });
        }

        // Bilet kanalındaki mesajları çek
        const messages = await interaction.channel.messages.fetch({ limit: 50 });
        // Bilet sahibinin son mesajını veya en son atılan uzun mesajı bul
        const partnerMesaji = messages.find(m => !m.author.bot && m.content.length > 5);

        if (!partnerMesaji) {
            return interaction.editReply({ content: "❌ Kanalda partnerlik metni bulunamadı! Lütfen üyenin metin gönderdiğinden emin olun." });
        }

        const embed = new EmbedBuilder()
            .setTitle("🤝 YENİ PARTNERLİK")
            .setDescription(partnerMesaji.content)
            .setColor("#8B0000")
            .setFooter({ text: `Partnerlik Yapan Yetkili: ${interaction.user.tag}` })
            .setTimestamp();

        await partnerKanal.send({ embeds: [embed] });
        await interaction.editReply({ content: `✅ Partnerlik metni ${partnerKanal} kanalına başarıyla gönderildi ve talep kapatılıyor!` });

        setTimeout(async () => {
            try { await interaction.channel.delete(); } catch (err) {}
        }, 3000);
    }

    // PARTNERLİK REDDETME (Kırmızı Buton)
    if (interaction.customId === 'partner_reddet') {
        await interaction.reply("❌ Partnerlik talebi reddedildi. Kanal 3 saniye içinde kapatılıyor...");
        setTimeout(async () => {
            try { await interaction.channel.delete(); } catch (err) {}
        }, 3000);
    }

    // Ticket Açma
    if (interaction.customId.startsWith('ticket_') && !['ticket_kapat', 'partner_onayla', 'partner_reddet'].includes(interaction.customId)) {
        await interaction.deferReply({ ephemeral: true });

        const tür = interaction.customId.split('_')[1];
        let turAdi = "Genel Destek";
        if (tür === 'ekipalim') turAdi = "Ekip Alım";
        if (tür === 'partnerlik') turAdi = "Partnerlik";
        if (tür === 'reklam') turAdi = "Reklam";
        if (tür === 'merge') turAdi = "Merge / Ally";

        const mevcutKanal = interaction.guild.channels.cache.find(c => c.name === `ticket-${interaction.user.username.toLowerCase()}`);
        if (mevcutKanal) return interaction.editReply({ content: `Zaten açık bir talebiniz var: ${mevcutKanal}` });

        const kanal = await interaction.guild.channels.create({
            name: `ticket-${interaction.user.username}`,
            type: ChannelType.GuildText,
            parent: TICKET_KATEGORI_ID,
            permissionOverwrites: [
                { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
                { id: YETKILI_ROL_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
            ],
        });

        // Partnerlik için özel yönlendirme ve özel 2 buton
        if (tür === 'partnerlik') {
            const embed = new EmbedBuilder()
                .setTitle(`🤝 Partnerlik Başvurusu`)
                .setDescription(`Merhaba ${interaction.user}, lütfen **partnerlik metninizi bu kanala gönderiniz**.\n\nYetkililerimiz metninizi inceleyip aşağıdaki butonlarla işlem yapacaktır.`)
                .setColor("#8B0000");

            const partnerRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('partner_onayla').setLabel('Onayladım').setEmoji('✅').setStyle(ButtonStyle.Secondary), // Siyah buton
                new ButtonBuilder().setCustomId('partner_reddet').setLabel('Reddettim').setEmoji('❌').setStyle(ButtonStyle.Danger)     // Kırmızı buton
            );

            await kanal.send({ content: `<@&${YETKILI_ROL_ID}> | ${interaction.user}`, embeds: [embed], components: [partnerRow] });
        } else {
            // Diğer bilet türleri için standart görünüm
            const embed = new EmbedBuilder()
                .setTitle(`🩸 Talep Türü: ${turAdi}`)
                .setDescription(`Merhaba ${interaction.user}, talebiniz oluşturuldu. Yetkililerimiz birazdan ilgilenecektir.`)
                .setColor("#8B0000");

            const kapatButon = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ticket_kapat').setLabel('Talebi Kapat').setEmoji('🔒').setStyle(ButtonStyle.Danger)
            );

            await kanal.send({ content: `<@&${YETKILI_ROL_ID}> | ${interaction.user}`, embeds: [embed], components: [kapatButon] });
        }

        await interaction.editReply({ content: `Destek talebiniz oluşturuldu: ${kanal}` });
    }

    // Standart Ticket Kapatma
    if (interaction.customId === 'ticket_kapat') {
        await interaction.reply("Destek talebi 3 saniye içinde kapatılıyor...");
        setTimeout(async () => {
            try { await interaction.channel.delete(); } catch (err) {}
        }, 3000);
    }
});

client.login(process.env.TOKEN);