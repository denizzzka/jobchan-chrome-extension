function rfind(s)
{
	let root = $('#chrome-web-comments-shadow-dom')[0]
		.shadowRoot;

	return $(root).find(s);
}

function getSecondLevelDomain() {
	const host = location.hostname;
	const parts = host.split('.');

	const sld = parts[parts.length - 2];
	const tld = parts[parts.length - 1];

	return `${sld}.${tld}`;
}

function panelWidthKey() {
	return "panel-width:" + getSecondLevelDomain();
}

function panelStateKey() {
	return "panel-state:" + getSecondLevelDomain();
}

const panel_local_storage = {
	getWidth: async () => {
		const key = panelWidthKey();
		const r = await chrome.storage.local.get(key);

		let w = r?.[key];

		if(w === undefined)
			w = rfind('#chrome-web-comments-panel').width();

		return w;
	},

	setWidth: (w) => {
		const key = panelWidthKey();
		chrome.storage.local.set({ [key]: w });
	},

	panelStateSet: (isOpened) => {
		const key = panelStateKey();
		chrome.storage.local.set({ [key]: isOpened });
	},

	isPanelOpened: async () => {
		const key = panelStateKey();
		const r = await chrome.storage.local.get(key);

		return (r?.[key] === undefined) ? false : r?.[key];
	}
}

const minOpenPanelGap = 130;
const minOpenPanelWidth = 30;

const app = {

	init: () => {
		$(document).on('DOMContentLoaded', async (e) => {
			$(document).off('DOMContentLoaded');

			await app.initCommentLists();
			app.events();

			if(await panel_local_storage.isPanelOpened())
			{
				if(document.comments_num > 0)
					app.panelOpeningRoutine();
			}
		});
	},

	events: () => {
		let root = rfind('#all-stuff');

		app.panelResizingEventsHandler(root);

		chrome.storage.onChanged.addListener(async(changes, namespace) => {
			app.setProperSubscribedState(document.page_id);
		});

		$(root).on('submit', '#chrome-web-comments-form', app.submitCommentEventHandler);
		$(root).on('click', '#chrome-web-comments-panel-button', app.openPanelButtonClickHdlr);
		$(root).on('submit', '.cwc-answear-form', app.submitAnswerToCommentEventHandler);
		$(root).on('click', '.chrome-web-comments-item-answear', app.showAnswearForm);
		$(root).on('click', '.chrome-web-comments-item-declineBtn', app.hideAnswerForm);
		$(root).on('click', '#chrome-web-comments-panel-close', app.closePanelEventHandler);
		$(root).on('click', '.cwc-answear-user', app.selectUserAnswear);
		$(root).on('click', '#subscrBtn', app.subscribe);
		$(root).on('click', '#unsubscrBtn', app.unsubscribe);
		$(root).on('click', '.chrome-web-comments-item-editBtn', app.editComment);
		$(root).on('click', '.chrome-web-comments-item-deleteBtn', app.deleteComment);
		$(root).on('click', '.report-button', app.complaintButtonPressedHdl);
		$(root).on('input', '#cwc_user', () => chrome.storage.local.set({ cwc_user: $('#cwc_user').val() }) )
	},

	panelResizingEventsHandler: (root) => {
		const panel = rfind('#chrome-web-comments-panel');

		let jitter;
		const setPanelWidth = function(absX) {
			if(absX < minOpenPanelWidth) return;

			let invWidth = window.innerWidth - absX - jitter;

			if(invWidth < minOpenPanelGap) invWidth = minOpenPanelGap;

			panel.css('width', `${invWidth}px`);
		}

		$(root).on('mousedown', '#chrome-web-comments-panel-resizer', (e) => {
			let $rszr = $(e.target);
			jitter = window.innerWidth - panel.width() - e.clientX;

			$('html,body').css('cursor','ew-resize');
			const transBackup = panel.css('transition');
			panel.css('transition', 'none');

			let currPanelWidth = e.clientX;
			let intervalId = setInterval(() => { setPanelWidth(currPanelWidth); }, 25);

			$(document).on('mouseup', (e) => {
				$(document).off('mousemove');
				$(document).off('mouseup');
				clearInterval(intervalId);
				setPanelWidth(e.clientX);
				panel.css('transition', transBackup);
				$('html,body').css('cursor','default');

				panel_local_storage.setWidth(panel.width());
			});

			$(document).on('mousemove', (e) => {
				currPanelWidth = e.clientX;
			});
		});
	},

	getURL: () => location.href.split('?')[0],

	setProperSubscribedState: async () => {
		app.displayUnreadSubs();

		const s = await subscriptions.isSubscribed(document.page_id);

		rfind('#subscrBtn').prop('disabled', s == true);
		rfind('#unsubscrBtn').prop('disabled', s == false);
	},

	subscribe: async () => {
		await subscriptions.upsertSubscription(document.page_id, app.getURL(), $("title").text(), document.latest_activity_id);
		app.setProperSubscribedState();
	},

	unsubscribe: async () => {
		await subscriptions.deleteSubscription(document.page_id);
		app.setProperSubscribedState();
	},

	selectUserAnswear: function(){
		let e = $(this);

		e.closest('.chrome-web-comments-item-wrap').prev().find('.chrome-web-comments-item-user:contains("'+ e.text().replace('@', '') +'")').closest('.chrome-web-comments-item').addClass('active').delay(600).queue( next => {
			$('.chrome-web-comments-item.active').removeClass('active');
			next();
		});
	},

	initCommentLists: async () => {
		let shadow;

		{
			let s = $(`<section id="chrome-web-comments-shadow-dom"></section>`)[0];
			shadow = s.attachShadow({ mode: 'open' });
			$('body').append(s);
		}

		let data = await app.request( { action: 'getComments' } );

		if( data?.hide_panel )
			return false;

		if( data?.page_id === undefined )
		{
			document.latest_activity_id = null;
		}
		else
		{
			document.page_id = data.page_id;
			document.latest_activity_id = data.latest_activity_id;
			document.comments_num = data.comments_number;

			await subscriptions.markAsReadIfSubscribed(document.page_id, document.latest_activity_id);
		}

		const url = chrome.runtime.getURL("panel/panel.html")
		const response = await fetch(url);
		$(shadow).append(await response.text());

		$(shadow).find('#all-stuff').append(
			`<link rel="stylesheet" href="`+chrome.runtime.getURL("assets/style.css")+`">`
		);

		$(shadow).find('.relative-href').each(function(i, e) {
			const base = $(e).attr("href");
			$(e).attr("href", chrome.runtime.getURL(base));
		});

		app.updateCounterButtonText(0);

		app.setProperSubscribedState();

		chrome.storage.local.get('cwc_user', data => $(shadow).find('#cwc_user').val( data['cwc_user'] ? data['cwc_user'] : 'Аноним' ) );

		if(data?.comments !== undefined && Object.keys(data.comments).length)
		{
			for( k in data.comments )
			{
				const comment = data.comments[k];
				const own = await own_comments.getCommentBelongings(document.page_id, comment.msg_id);

				app.addComment( comment, own !== undefined, (comment.children ? comment.children : []) );
			}
		}
	},

	updateCounterButtonText: (n) => {
		document.comments_num += n;

		rfind("#msgs-counter").text(document.comments_num);

		if(document.comments_num !== undefined && document.comments_num > 0)
		{
			rfind('#zero-comments').hide();
			rfind('#comments-avail').show();
		}
		else
		{
			rfind('#zero-comments').show();
			rfind('#comments-avail').hide();
		}
	},

	displayUnreadSubs: () => {
		subscriptions.getUnreadCount().then((unread) => {
			if(unread > 0)
			{
				rfind('#unreadNum').text(unread);
				rfind('#haveUnread').show();
			}
			else
				rfind('#haveUnread').hide();
		});
	},

	showAnswearForm: function(){
		let e = $(this);
		let form = e.closest('.chrome-web-comments-item').find('.cwc-answear-form');
		form.find('.chrome-web-comments-item-answear').hide();
		form.find('.chrome-web-comments-item-saveEditedBtn').hide();
		form.find('.chrome-web-comments-item-sendAnswerBtn').show();
		$('textarea[name="comment"]').val('');
		form.show(250);
	},

	showEditForm: function(e){
		e.find('.cwc-answear-form').show(250);
		e.find('.chrome-web-comments-item-sendAnswerBtn').hide();
		e.find('.chrome-web-comments-item-saveEditedBtn').show();
	},

	hideAnswerForm: function(){
		let e = $(this);
		let form = e.closest('.chrome-web-comments-item').find('.cwc-answear-form')
		form.hide(250);
		form.find('.chrome-web-comments-item-answear').show();
	},

	handleCommentSubmission: async function (form, args, root_id = null) {
		const isAnswer = (root_id != null);

		form.find('textarea[name="comment"]').prop('disabled', true);

		args = Object.assign({ name: rfind('#cwc_user').val() }, args);
		args['author_secret'] = self.crypto.randomUUID();

		let add = await app.request({ action: "addComment" }, args);

		form.find('textarea[name="comment"]').prop('disabled', false);

		if(add === undefined)
		{
			app.showErrorBanner("Ошибка отправки сообщения");
			return;
		}

		form.find('textarea[name="comment"]').val('');

		document.page_id = add.page_id;
		document.latest_activity_id = add.latest_activity_id;
		await app.subscribe();

		if (add.msg_id) {
			app.updateCounterButtonText(1);
			await own_comments.upsertComment(document.page_id, add.msg_id, args.author_secret);

			if (isAnswer) {
				app.addAnswerToComment(root_id, add, true);
			} else {
				app.addComment(add, true);
			}
		}
	},

	submitCommentEventHandler: async function (event) {
		event.preventDefault();

		let form = $(this);
		let args = app.getFormData(form);

		await app.handleCommentSubmission(form, args);

		return false;
	},

	submitAnswerToCommentEventHandler: async function (event) {
		event.preventDefault();

		let form = $(this);
		let args = app.getFormData(form);

		// root_id isn't needed on the backend
		const root_id = args.root_id;
		delete args['root_id'];

		await app.handleCommentSubmission(form, args, root_id);

		form.hide(250);
		return false;
	},

	editComment: async function (event) {
		let msg_wrap = event.target.closest('.chrome-web-comments-item-wrap');
		const msg_id = msg_wrap.getAttribute("id");

		const b = await own_comments.getCommentBelongings(document.page_id, msg_id);

		const msg = await app.request({ action: 'getCommentForEdit' }, {
			msg_id: msg_id,
			author_secret: b.secret
		});

		if(msg === undefined)
		{
			app.showErrorBanner("Ошибка получения сообщения");
			return;
		}

		if (msg?.error === undefined) {
			const textarea = msg_wrap.querySelector('.cwc-answear-form textarea[name="comment"]');
			textarea.value = msg.comment;

			const saveButton = msg_wrap.querySelector('.chrome-web-comments-item-saveEditedBtn');
			saveButton.onclick = async (e) => {
				e.preventDefault();

				$(textarea).prop('disabled', true);;

				const updatedText = textarea.value;

				const response = await app.request({ action: 'updateComment' }, {
					msg_id: msg_id,
					author_secret: b.secret,
					name: msg.author,
					comment: updatedText
				});

				$(textarea).prop('disabled', false);

				if(response === undefined)
				{
					app.showErrorBanner("Ошибка при сохранении комментария");
					return;
				}

				if (response?.error === undefined) {
					subscriptions.markAsReadIfSubscribed(document.page_id, response.latest_activity_id);

					msg_wrap.querySelector('.chrome-web-comments-item-comment')
						.innerHTML = response.comment;

					$(textarea).val('');

					$(msg_wrap).find('.cwc-answear-form').hide(250);
				}
			};

			app.showEditForm($(msg_wrap));
		}
	},

	deleteComment: async(event) => {
		if(confirm("Удалить сообщение?") == false)
			return;

		let msg_wrap = event.target.closest('.chrome-web-comments-item-wrap');
		const msg_id = msg_wrap.getAttribute("id");

		const b = await own_comments.getCommentBelongings(document.page_id, msg_id);

		const ret = await app.request({ action: 'deleteComment' },
		{
			msg_id: msg_id,
			author_secret: b.secret
		});

		if(ret === undefined)
		{
			app.showErrorBanner("Ошибка удаления сообщения");
			return;
		}

		if(ret?.error === undefined)
		{
			msg_wrap.remove();
			app.updateCounterButtonText(-1);
		}
	},

	complaintButtonPressedHdl: async(event) => {
		const msg_wrap = event.target.closest('.chrome-web-comments-item-wrap');
		const msg_id = msg_wrap.getAttribute("id");

		const ret = await app.request({ action: 'report' },
		{
			msg_id: msg_id,
		});

		if(ret === undefined)
		{
			app.showErrorBanner("Ошибка отправки жалобы");
			return;
		}

		if(ret?.error === undefined)
			$(event.target).text("Жалоба отправлена");
	},

	cloneOfCommentTemplate: async(args, own, root_id = null) => {
		const showModifyControls = await own_comments.isCommentModifiable(document.page_id, args.msg_id);

		//TODO: read template once during page initialization
		const template = rfind("#template-comment-wrapper")[0];

		const c = $( document.importNode(template.content, true) );
		c.find(".chrome-web-comments-item-wrap").attr("id", args.msg_id);
		c.find(".chrome-web-comments-item").attr("id", args.msg_id);
		c.find(".chrome-web-comments-item-user").text(args.author);
		c.find(".chrome-web-comments-item-date").text(args.created);
		c.find(".chrome-web-comments-item-comment").html(args.comment);
		c.find('.cwc-answear-form input[name="root_id"]').attr("value", (root_id == null ? args.msg_id : root_id));
		c.find('.cwc-answear-form input[name="parent_id"]').attr("value", args.msg_id);
		c.find(".cwc-child-list").attr("data-list-id", args.msg_id);

		if(own)
			c.find(".chrome-web-comments-item").addClass("cwc-my-comment-true");

		if(showModifyControls)
			c.find(".report-button").hide();
		else
			c.find(".modifiable").hide();

		return c;
	},

	addComment: async ( args, own, children = [] ) => {
		const c = await app.cloneOfCommentTemplate(args, own);

		rfind('#chrome-web-comments-lists').prepend(c);

		if( Object.keys( children ).length ){
			for( let k in children )
			{
				const child = children[k];
				const own = await own_comments.getCommentBelongings(document.page_id, child.msg_id);

				app.addAnswerToComment(args.msg_id, child, own !== undefined);
			}
		}
	},

	addAnswerToComment: async ( root_id, args, own ) => {
		args.comment = args.comment.replace(/(@.+),/g, '<span class="cwc-answear-user">$1</span>,');

		const c = await app.cloneOfCommentTemplate(args, own, root_id);
		rfind('.cwc-child-list[data-list-id="'+ root_id +'"]').append(c);

		//TODO: deduplicate code wth previous one function and with initCommentLists()
		if( args.children && args.children.length ){
			for( let k in args.children )
			{
				const child = children[k];
				const own = await own_comments.getCommentBelongings(document.page_id, child.msg_id);

				app.addAnswerToComment(root_id, child, own !== undefined);
			}
		}
	},

	openPanelButtonClickHdlr: async (e) => {
		await app.panelOpeningRoutine();

		const p = rfind('#chrome-web-comments-form textarea[name="comment"]');

		setTimeout(() => { p.focus(); }, 100);
	},

	panelOpeningRoutine: async () => {
		const panel = rfind('#chrome-web-comments-panel');

		const orig_w = await panel_local_storage.getWidth();
		let w = orig_w;

		const gap = window.innerWidth - w;

		if(gap < minOpenPanelGap)
		{
			w = window.innerWidth - minOpenPanelGap;

			if(w < minOpenPanelWidth)
				w = minOpenPanelWidth;
		}

		await panel.css('width', `${w}px`);
		await panel.addClass('active');

		panel_local_storage.panelStateSet(true);
	},

	closePanelEventHandler: () => {
		rfind('#chrome-web-comments-panel').removeClass('active');
		panel_local_storage.panelStateSet(false);
	},

	getFormData: ( e ) => {
		data = {};

		e.serializeArray().map(( e ) => {
			if( ( val = e.value.trim() ) )
				data[ e.name ] = val;
		});
		return data;
	},

	showErrorBanner: (msg) => {
		rfind('#cwc-error').text( msg ).delay(5000).queue( next => {
			rfind('#cwc-error').text('');
			next();
		});
	},

	request: async (args, post_args ={}) => {
		args["url"] = app.getURL();

		let data;

		try
		{
			data = await requester.request(args, post_args);

			if( data?.error )
				app.showErrorBanner(data.error);

			return data;
		}
		catch(err)
		{
			console.log("Нет связи с сервером?", err);
		}
	}
}

app.init();
