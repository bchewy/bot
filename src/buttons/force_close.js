const { Button } = require('@eartharoid/dbf');
const ExtendedEmbedBuilder = require('../lib/embed');
const { isStaff } = require('../lib/users');
const ms = require('ms');

module.exports = class ForceCloseButton extends Button {
	constructor(client, options) {
		super(client, {
			...options,
			id: 'force_close', // Matches the custom ID set in manager.js
		});
	}

	/**
	 * @param {object} idData - Parsed custom ID data (contains action: 'custom', id: 'force_close')
	 * @param {import("discord.js").ButtonInteraction} interaction
	 */
	async run(idData, interaction) {
		/** @type {import("../client")} */
		const client = this.client;

		await interaction.deferReply({ ephemeral: true });

		const ticket = await client.tickets.getTicket(interaction.channel.id);
		
		if (!ticket) {
			const settings = await client.prisma.guild.findUnique({ where: { id: interaction.guild.id } });
			const getMessage = client.i18n.getLocale(settings?.locale || 'en-GB');
			return await interaction.editReply({
				embeds: [
					new ExtendedEmbedBuilder({
						iconURL: interaction.guild?.iconURL(),
						text: settings?.footer,
					})
						.setColor(settings?.errorColour || 'Red')
						.setTitle(getMessage('misc.not_ticket.title'))
						.setDescription(getMessage('misc.not_ticket.description')),
				],
			});
		}

		const { guild: settings, category } = ticket;
		const getMessage = client.i18n.getLocale(settings.locale);
		const staff = await isStaff(interaction.guild, interaction.user.id, category.staffRoles); // Check against category-specific staff roles

		if (!staff) {
			return await interaction.editReply({
				embeds: [
					new ExtendedEmbedBuilder({
						iconURL: interaction.guild.iconURL(),
						text: settings.footer,
					})
						.setColor(settings.errorColour)
						.setTitle(getMessage('commands.slash.force-close.not_staff.title')) // Re-use existing localization
						.setDescription(getMessage('commands.slash.force-close.not_staff.description')),
				],
			});
		}

		// Staff confirmed, proceed with force close
		await interaction.editReply({
			embeds: [
				new ExtendedEmbedBuilder({
					iconURL: interaction.guild.iconURL(),
					text: settings.footer,
				})
					.setColor(settings.successColour)
					.setTitle(getMessage('commands.slash.force-close.closed_one.title')) // Re-use existing localization
					.setDescription(getMessage('commands.slash.force-close.closed_one.description', { ticket: ticket.id })),
			],
		});

		// Use a short delay like the slash command
		setTimeout(async () => {
			try {
				await client.tickets.finallyClose(ticket.id, {
					closedBy: interaction.user.id,
					reason: getMessage('ticket.force_closed_by_button', { user: interaction.user.tag }), // Add a specific reason
				});
			} catch (error) {
				client.log.error(`Failed to force close ticket ${ticket.id} via button:`, error);
				// Optionally notify the user about the failure
				try {
					await interaction.followUp({ 
						content: 'An error occurred while trying to force close the ticket.', 
						ephemeral: true 
					});
				} catch (followUpError) {
					client.log.error('Failed to send force close error follow-up:', followUpError);
				}
			}
		}, ms('1s')); // Short delay before actual close action
	}
}; 