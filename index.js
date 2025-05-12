const fs = require('fs');
const path = require('path');
const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    StringSelectMenuBuilder
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const dataFilePath = path.join(__dirname, 'vacationData.json');

function loadVacationData() {
    if (!fs.existsSync(dataFilePath)) {
        fs.writeFileSync(dataFilePath, JSON.stringify({}));
    }
    return JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
}

function saveVacationData(data) {
    fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 4));
}

let vacationData = loadVacationData();
const pendingVacationRequests = new Map();

client.once('ready', () => {
    console.log(`تم تسجيل الدخول كـ ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
    if (message.content === '!vacation') {
        const vacationEmbed = new EmbedBuilder()
            .setTitle('نظام طلب الإجازات')
            .setDescription('اضغط على الزر أدناه لطلب إجازة.')
            .setColor('#00FF00')
            .setTimestamp();

        const button = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('طلب_اجازة')
                .setLabel('طلب إجازة')
                .setStyle(ButtonStyle.Primary)
        );

        await message.channel.send({ embeds: [vacationEmbed], components: [button] });
    }
});

client.on('interactionCreate', async (interaction) => {
    try {
        if (interaction.isButton()) {
            if (interaction.customId === 'طلب_اجازة') {
                const selectEmbed = new EmbedBuilder()
                    .setTitle('اختيار نوع الإجازة')
                    .setDescription('هل ترغب في طلب إجازة بالدقائق أو بالأيام؟')
                    .setColor('#00FF00')
                    .setTimestamp();

                const selectMenu = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('select_vacation_type')
                        .setPlaceholder('اختر نوع الإجازة')
                        .addOptions([
                            { label: 'إجازة بالدقائق', value: 'minutes' },
                            { label: 'إجازة بالأيام', value: 'days' }
                        ])
                );

                await interaction.reply({ embeds: [selectEmbed], components: [selectMenu], ephemeral: true });
            }
        } else if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'select_vacation_type') {
                const vacationType = interaction.values[0];
                pendingVacationRequests.set(interaction.user.id, { vacationType });

                const roles = interaction.member.roles.cache
                    .filter(role => role.id !== interaction.guild.id)
                    .map(role => ({ label: role.name, value: role.id }));

                if (roles.length === 0) {
                    return interaction.reply({ content: '❌ ليس لديك أي رتب للاختيار.', ephemeral: true });
                }

                const roleSelectMenu = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('select_role')
                        .setPlaceholder('اختر رتبتك الحالية')
                        .addOptions(roles)
                );

                const roleEmbed = new EmbedBuilder()
                    .setTitle('اختر رتبتك الحالية')
                    .setDescription('من فضلك اختر الرتبة التي تريد استخدامها كرتبتك الحالية من القائمة أدناه.')
                    .setColor('#00FF00')
                    .setTimestamp();

                await interaction.update({ embeds: [roleEmbed], components: [roleSelectMenu] });
            }

            if (interaction.customId === 'select_role') {
                const pendingRequest = pendingVacationRequests.get(interaction.user.id);
                if (!pendingRequest || !pendingRequest.vacationType) {
                    return interaction.reply({ content: '❌ لم يتم تحديد نوع الإجازة بعد.', ephemeral: true });
                }
                pendingRequest.selectedRoleId = interaction.values[0];
                pendingVacationRequests.set(interaction.user.id, pendingRequest);

                const modal = new ModalBuilder()
                    .setCustomId('نموذج_الاجازة')
                    .setTitle('طلب إجازة');

                let durationInput;
                if (pendingRequest.vacationType === 'minutes') {
                    durationInput = new TextInputBuilder()
                        .setCustomId('مدة_الإجازة_دقائق')
                        .setLabel('مدة الإجازة (بالدقائق)')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true);
                } else {
                    durationInput = new TextInputBuilder()
                        .setCustomId('مدة_الإجازة_أيام')
                        .setLabel('مدة الإجازة (بالأيام)')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true);
                }

                const reasonInput = new TextInputBuilder()
                    .setCustomId('سبب_الإجازة')
                    .setLabel('سبب طلب الإجازة')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true);

                const row1 = new ActionRowBuilder().addComponents(durationInput);
                const row2 = new ActionRowBuilder().addComponents(reasonInput);

                modal.addComponents(row1, row2);
                await interaction.showModal(modal);
            }
        } else if (interaction.isModalSubmit()) {
            if (interaction.customId === 'نموذج_الاجازة') {
                const pendingRequest = pendingVacationRequests.get(interaction.user.id);
                if (!pendingRequest || !pendingRequest.vacationType || !pendingRequest.selectedRoleId) {
                    return interaction.reply({ content: '❌ بيانات الطلب غير مكتملة.', ephemeral: true });
                }
                const vacationType = pendingRequest.vacationType;
                const selectedRoleId = pendingRequest.selectedRoleId;
                let duration = interaction.fields.getTextInputValue(
                    vacationType === 'minutes' ? 'مدة_الإجازة_دقائق' : 'مدة_الإجازة_أيام'
                );
                const reason = interaction.fields.getTextInputValue('سبب_الإجازة');
                const durationInt = parseInt(duration);

                if (isNaN(durationInt) || durationInt <= 0) {
                    return interaction.reply({ content: '❌ يجب أن تكون مدة الإجازة صالحة.', ephemeral: true });
                }

                vacationData[interaction.user.id] = {
                    userId: interaction.user.id,
                    roleId: selectedRoleId,
                    duration: durationInt,
                    reason: reason,
                    vacationType,
                    status: 'قيد الانتظار'
                };
                saveVacationData(vacationData);

                await interaction.reply({ content: '✅ تم إرسال طلب الإجازة بنجاح.', ephemeral: true });
            }
        }
    } catch (error) {
        console.error('Error handling interaction:', error);
        if (interaction.replied || interaction.deferred) {
            interaction.followUp({ content: '❌ حدث خطأ أثناء معالجة التفاعل.', ephemeral: true });
        } else {
            interaction.reply({ content: '❌ حدث خطأ أثناء معالجة التفاعل.', ephemeral: true });
        }
    }
});

client.login(process.env.TOKEN);
