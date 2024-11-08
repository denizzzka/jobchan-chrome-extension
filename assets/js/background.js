const subsAlarmName = 'check-subscriptions';
const defaultUpdateTimeout = 1.0;

const app = {

	init: async () => {

		self.importScripts('/assets/js/fetch.js');
		self.importScripts('/assets/js/storage.js');

		chrome.action.setBadgeBackgroundColor({ color: "#ff6600" });
		chrome.action.setBadgeTextColor({ color: "#ffffff" });

		app.actions();

		if(await app.updateBadgeFromStorage())
			app.setSubsUpdateAlarm();
	},

	isAlarmSet: async () => {
			return (await chrome.alarms.get(subsAlarmName)) !== undefined;
	},

	setSubsUpdateAlarm: (mins = defaultUpdateTimeout) => {
		chrome.alarms.create(subsAlarmName, {
			delayInMinutes: mins,
			periodInMinutes: 15 // emergency timeout
		});
	},

	stopSubsUpdateAlarm: () => {
		chrome.alarms.clear(subsAlarmName);
	},

	updateBadgeFromStorage: async () => {
		const isSubsStored = subscriptions.isSubsStored();

		let unreadNum = await subscriptions.getUnreadCount();

		chrome.action.setBadgeText({
			text: unreadNum > 0 ? unreadNum.toString() : ""
		});

		return isSubsStored;
	},

	actions: () => {

		chrome.alarms.onAlarm.addListener( async(alarm_name) => {
			if(alarm_name.name != subsAlarmName)
				return;

			const page_ids = (await subscriptions.bySub())
				.map((a) => a.page_id);

			const stats = await app.request(
				{ action: 'getStats' },
				{
					"page_ids": page_ids
				}
			);

			if(stats === undefined)
				return; // connection error

			// Set next update timepoint
			app.setSubsUpdateAlarm(
				defaultUpdateTimeout * stats.update_timeout_factor
			);

			stats.latest_actions.forEach(async(e) =>
				await subscriptions.setActivityCounterIfSubscribed(e.page_id, e.latest_activity_id)
			);

			const found = stats.latest_actions
				.map((e) => e.page_id);

			// not found:
			subscriptions.bySub().then((r) => {
				r.forEach((a) => {
					if(found.includes(a.page_id) == false)
						subscriptions.setRemoved(a.page_id);
				});
			});
		});

		chrome.storage.onChanged.addListener(async(changes, namespace) => {
			const haveSubs = await app.updateBadgeFromStorage();

			if(haveSubs)
			{
				if(!(await app.isAlarmSet()))
					app.setSubsUpdateAlarm();
			}
			else
				app.stopSubsUpdateAlarm();
		});

	},

	getLocalStorage: ( key ) => {
		return new Promise(resolve => {
			chrome.storage.local.get(key, data => {
				resolve( data[ key ] );
			});
		});
	},

	request: async (get_args, post_args) => {
		let r

		try
		{
			r = await requester.request(get_args, post_args);
		}
		catch(err)
		{
			console.log("Background task", err);

			chrome.action.setBadgeText({
				text: " ! "
			});
		}

		return r;
	}
};

app.init();