const subsAlarmName = 'check-subscriptions';
const defaultUpdateTimeout = 1.0;

const app = {
	subscriptions: null,

	init: () => {
		this.subscriptions = new SubscriptionsStorage();

		chrome.action.setBadgeBackgroundColor({ color: "#ff6600" });
		chrome.action.setBadgeTextColor({ color: "#ffffff" });

		app.actions();

		app.setSubsUpdateAlarm();
		app.refreshSubscrVisualisation();
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

	refreshSubscrVisualisation: async () => {
		let unreadNum = await subscriptions.getUnreadSubsCount();

		chrome.action.setTitle({
			title: "JobChan: Обсуждение вакансий\nНепрочитанных тем: "+unreadNum
		});

		chrome.action.setBadgeText({
			text: unreadNum > 0 ? unreadNum.toString() : ""
		});
	},

	actions: () => {

		chrome.alarms.onAlarm.addListener( async(alarm_name) => {
			if(alarm_name.name != subsAlarmName)
				return;

			const page_ids = (await subscriptions.getAllSubs())
				.map((a) => a.page_id);

			// User has no subscriptions?
			if(page_ids.length == 0)
				return;

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

			// Mark not found subscriptions as removed:
			subscriptions.getAllSubs().then((r) => {
				r.forEach((a) => {
					if(found.includes(a.page_id) == false)
						subscriptions.setRemoved(a.page_id);
				});
			});

			app.refreshSubscrVisualisation();
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