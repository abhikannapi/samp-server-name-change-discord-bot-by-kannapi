/*
.-------------------------------------------------------------------------.
|  _  __    _    _   _ _   _    _    ____ ___ |
| | |/ /   / \  | \ | | \ | |  / \  |  _ \_ _| |
| | ' /   / _ \ |  \| |  \| | / _ \ | |_) | |  |
| | . \  / ___ \| |\  | |\  |/ ___ \|  __/| |  |
| |_|\_\/_/   \_\_| \_|_| \_/_/   \_\_|  |___| |
'-------------------------------------------------------------------------'
 developer kannapi.abhi || github :-https://github.com/abhikannapi
 insta :- https://www.instagram.com/_ab.h.i_nav_?igsh=MTVkdm5wc2I3NzQyeA==
 discord :- https://discord.gg/SDYPrkwAd 
*/
require('dotenv').config();

const {
    Client,
    GatewayIntentBits,
    SlashCommandBuilder,
    REST,
    Routes,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits
} = require('discord.js');

const mysql = require('mysql2/promise');



const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});



const db = mysql.createPool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});


const NAME_CHANGE_COST = 200000;

const REQUEST_CHANNEL     = 'enter you channel id ';
const REVIEW_CHANNEL      = 'enter you channel id ';
const ACCEPT_LOG_CHANNEL  = 'enter you channel id ';
const DECLINE_LOG_CHANNEL = 'enter you channel id ';

const STAFF_ROLE_ID = 'enter you admin role id ';

const stickyCache = new Map();


async function ensureStickyTable() {
    await db.execute(`
        CREATE TABLE IF NOT EXISTS sticky_messages (
            channel_id   VARCHAR(30)  NOT NULL PRIMARY KEY,
            message      TEXT         NOT NULL,
            last_msg_id  VARCHAR(30)  DEFAULT NULL
        )
    `);
}


async function loadStickies() {
    const [rows] = await db.execute('SELECT * FROM sticky_messages');
    for (const row of rows) {
        stickyCache.set(row.channel_id, {
            message:    row.message,
            lastMsgId:  row.last_msg_id
        });
    }
    console.log(`✅ Loaded ${rows.length} sticky message(s) from database.`);
}


const commands = [
    new SlashCommandBuilder()
        .setName('changename')
        .setDescription('Request an RP name change')

        .addStringOption(option =>
            option
                .setName('oldname')
                .setDescription('Your current RP name')
                .setRequired(true)
        )

        .addStringOption(option =>
            option
                .setName('newname')
                .setDescription('Your new RP name')
                .setRequired(true)
        )

        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Reason for name change')
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('createsticky')
        .setDescription('Set a sticky message in this channel (Staff only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)

        .addStringOption(option =>
            option
                .setName('message')
                .setDescription('The message to pin as sticky')
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('removesticky')
        .setDescription('Remove the sticky message from this channel (Staff only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

   
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);



(async () => {

    try {

        await rest.put(
            Routes.applicationGuildCommands(
                process.env.CLIENT_ID,
                process.env.GUILD_ID
            ),
            { body: commands }
        );

        console.log('✅ Slash commands registered.');

    } catch (err) {

        console.error('❌ Failed to register commands:', err);

    }

})();


client.once('clientReady', async () => {

    console.log(`✅ Logged in as ${client.user.tag}`);

    try {

        const connection = await db.getConnection();
        console.log('✅ MySQL connected');
        connection.release();

        await ensureStickyTable();
        await loadStickies();

    } catch (err) {

        console.error('❌ MySQL connection failed:', err.message);
        process.exit(1);

    }

});



client.on('messageCreate', async message => {

    if (message.author.bot) return;

    const sticky = stickyCache.get(message.channel.id);
    if (!sticky) return;

    try {


        if (sticky.lastMsgId) {
            try {
                const old = await message.channel.messages.fetch(sticky.lastMsgId);
                if (old) await old.delete();
            } catch (_) {
         
            }
        }

  
        const sent = await message.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setDescription(sticky.message)
                    .setColor('Gold')
                    .setFooter({ text: '📌 Sticky Message' })
            ]
        });

        sticky.lastMsgId = sent.id;

        await db.execute(
            'UPDATE sticky_messages SET last_msg_id = ? WHERE channel_id = ?',
            [sent.id, message.channel.id]
        );

    } catch (err) {
        console.error('❌ Sticky repost error:', err);
    }

});



client.on('interactionCreate', async interaction => {




    if (
        interaction.isChatInputCommand() &&
        interaction.commandName === 'changename'
    ) {

        if (interaction.channel.id !== REQUEST_CHANNEL) {

            return interaction.reply({
                content: '❌ You can only use this command in the request channel.',
                ephemeral: true
            });

        }

        const oldName = interaction.options.getString('oldname');
        const newName = interaction.options.getString('newname');
        const reason  = interaction.options.getString('reason');

        try {

   

            const [rows] = await db.execute(
                'SELECT * FROM users WHERE username = ?',
                [oldName]
            );

            if (rows.length === 0) {

                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('❌ RP Account Not Found')
                            .setDescription('Your old RP name does not exist.')
                            .setColor('Red')
                    ],
                    ephemeral: true
                });

            }

            const player = rows[0];


            if (player.bank < NAME_CHANGE_COST) {

                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('❌ Insufficient Balance')
                            .setDescription(
                                `You need ₹${NAME_CHANGE_COST.toLocaleString()} in your bank balance.`
                            )
                            .setColor('Red')
                    ],
                    ephemeral: true
                });

            }



            const [existing] = await db.execute(
                'SELECT * FROM users WHERE username = ?',
                [newName]
            );

            if (existing.length > 0) {

                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('❌ Name Already Taken')
                            .setDescription('This RP name already exists.')
                            .setColor('Red')
                    ],
                    ephemeral: true
                });

            }

     

            const embed = new EmbedBuilder()
                .setTitle('📋 RP Name Change Request')
                .addFields(
                    {
                        name: 'Discord User',
                        value: `<@${interaction.user.id}>`,
                        inline: true
                    },
                    {
                        name: 'Old RP Name',
                        value: oldName,
                        inline: true
                    },
                    {
                        name: 'New RP Name',
                        value: newName,
                        inline: true
                    },
                    {
                        name: 'Reason',
                        value: reason,
                        inline: false
                    },
                    {
                        name: 'Bank Balance',
                        value: `₹${player.bank.toLocaleString()}`,
                        inline: true
                    }
                )
                .setColor('Yellow')
                .setTimestamp();



            const row = new ActionRowBuilder().addComponents(

                new ButtonBuilder()
                   .setCustomId(
    `accept|${interaction.user.id}|${oldName}|${newName}`
)
                    .setLabel('Accept')
                    .setStyle(ButtonStyle.Success),

                new ButtonBuilder()
                    .setCustomId(
    `decline|${interaction.user.id}|${oldName}|${newName}`
)
                    .setLabel('Decline')
                    .setStyle(ButtonStyle.Danger)

            );


            const reviewChannel = await client.channels.fetch(REVIEW_CHANNEL);

            await reviewChannel.send({
                embeds: [embed],
                components: [row]
            });


            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('✅ Request Submitted')
                        .setDescription(
                            'Your RP name change request has been submitted for admin approval.'
                        )
                        .setColor('Green')
                ],
                ephemeral: true
            });

        } catch (err) {

            console.error('❌ /changename error:', err);

            return interaction.reply({
                content: '❌ Database error occurred.',
                ephemeral: true
            });

        }

    }
    if (
        interaction.isChatInputCommand() &&
        interaction.commandName === 'createsticky'
    ) {


        if (!interaction.member.roles.cache.has(STAFF_ROLE_ID)) {
            return interaction.reply({
                content: '❌ You do not have permission to use this command.',
                ephemeral: true
            });
        }

        const stickyText = interaction.options.getString('message');
        const channelId  = interaction.channel.id;

        try {


            const existing = stickyCache.get(channelId);
            if (existing?.lastMsgId) {
                try {
                    const old = await interaction.channel.messages.fetch(existing.lastMsgId);
                    if (old) await old.delete();
                } catch (_) { /* already gone */ }
            }

            const sent = await interaction.channel.send({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(stickyText)
                        .setColor('Gold')
                        .setFooter({ text: '📌 Sticky Message' })
                ]
            });

    
            await db.execute(
                `INSERT INTO sticky_messages (channel_id, message, last_msg_id)
                 VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE message = VALUES(message), last_msg_id = VALUES(last_msg_id)`,
                [channelId, stickyText, sent.id]
            );
            stickyCache.set(channelId, { message: stickyText, lastMsgId: sent.id });

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('✅ Sticky Message Set')
                        .setDescription('The sticky message has been set for this channel.')
                        .setColor('Green')
                ],
                ephemeral: true
            });

        } catch (err) {

            console.error('❌ /createsticky error:', err);

            return interaction.reply({
                content: '❌ Failed to set sticky message.',
                ephemeral: true
            });

        }

    }
    if (
        interaction.isChatInputCommand() &&
        interaction.commandName === 'removesticky'
    ) {

        if (!interaction.member.roles.cache.has(STAFF_ROLE_ID)) {
            return interaction.reply({
                content: '❌ You do not have permission to use this command.',
                ephemeral: true
            });
        }

        const channelId = interaction.channel.id;

        try {

            const existing = stickyCache.get(channelId);

            if (!existing) {
                return interaction.reply({
                    content: '❌ There is no sticky message in this channel.',
                    ephemeral: true
                });
            }

            if (existing.lastMsgId) {
                try {
                    const old = await interaction.channel.messages.fetch(existing.lastMsgId);
                    if (old) await old.delete();
                } catch (_) { /* already gone */ }
            }

            await db.execute(
                'DELETE FROM sticky_messages WHERE channel_id = ?',
                [channelId]
            );

            stickyCache.delete(channelId);

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('🗑️ Sticky Message Removed')
                        .setDescription('The sticky message has been removed from this channel.')
                        .setColor('Orange')
                ],
                ephemeral: true
            });

        } catch (err) {

            console.error('❌ /removesticky error:', err);

            return interaction.reply({
                content: '❌ Failed to remove sticky message.',
                ephemeral: true
            });

        }

    }
    if (interaction.isButton()) {



        if (!interaction.member.roles.cache.has(STAFF_ROLE_ID)) {

            return interaction.reply({
                content: '❌ You do not have permission.',
                ephemeral: true
            });

        }

        const parts = interaction.customId.split('|');

    const action = parts[0];
    const userId = parts[1];
    const oldName = parts[2];
    const newName = parts[3];
    
        if (action === 'accept') {

            try {



                await db.execute(
                    `UPDATE users
                     SET username = ?,
                         bank = bank - ?
                     WHERE username = ?`,
                    [newName, NAME_CHANGE_COST, oldName]
                );

                const member = await interaction.guild.members.fetch(userId);

                await member.setNickname(newName);



                const acceptEmbed = new EmbedBuilder()
                    .setTitle('✅ RP Name Change Accepted')
                    .addFields(
                        {
                            name: 'Discord User',
                            value: `<@${userId}>`,
                            inline: true
                        },
                        {
                            name: 'Old RP Name',
                            value: oldName,
                            inline: true
                        },
                        {
                            name: 'New RP Name',
                            value: newName,
                            inline: true
                        },
                        {
                            name: 'Amount Deducted',
                            value: `₹${NAME_CHANGE_COST.toLocaleString()}`,
                            inline: true
                        },
                        {
                            name: 'Accepted By',
                            value: interaction.user.tag,
                            inline: false
                        }
                    )
                    .setColor('Green')
                    .setTimestamp();

                const acceptChannel = await client.channels.fetch(
                    ACCEPT_LOG_CHANNEL
                );

                await acceptChannel.send({
                    embeds: [acceptEmbed]
                });

  

                return interaction.update({
                    embeds: [
                        EmbedBuilder.from(interaction.message.embeds[0])
                            .setColor('Green')
                            .setFooter({
                                text: `Accepted by ${interaction.user.tag}`
                            })
                    ],
                    components: []
                });

            } catch (err) {

                console.error('❌ Accept error:', err);

                return interaction.reply({
                    content: '❌ Failed to accept request.',
                    ephemeral: true
                });

            }

        }
        if (action === 'decline') {

            try {

                const declineEmbed = new EmbedBuilder()
                    .setTitle('❌ RP Name Change Declined')
                    .addFields(
                        {
                            name: 'Discord User',
                            value: `<@${userId}>`,
                            inline: true
                        },
                        {
                            name: 'Old RP Name',
                            value: oldName,
                            inline: true
                        },
                        {
                            name: 'Requested RP Name',
                            value: newName,
                            inline: true
                        },
                        {
                            name: 'Declined By',
                            value: interaction.user.tag,
                            inline: false
                        }
                    )
                    .setColor('Red')
                    .setTimestamp();

                const declineChannel = await client.channels.fetch(
                    DECLINE_LOG_CHANNEL
                );

                await declineChannel.send({
                    embeds: [declineEmbed]
                });

                return interaction.update({
                    embeds: [
                        EmbedBuilder.from(interaction.message.embeds[0])
                            .setColor('Red')
                            .setFooter({
                                text: `Declined by ${interaction.user.tag}`
                            })
                    ],
                    components: []
                });

            } catch (err) {

                console.error('❌ Decline error:', err);

                return interaction.reply({
                    content: '❌ Failed to decline request.',
                    ephemeral: true
                });

            }

        }

    }

});

client.login(process.env.TOKEN);
