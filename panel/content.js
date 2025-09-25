function rfind(s)
{
	let root = $('#chrome-web-comments-shadow-dom')[0]
		.shadowRoot;

	return $(root).find(s);
}

function getSecondLevelDomain() {
    const hostname = location.hostname;
    const parts = hostname.split('.');
    if (parts.length >= 2) {
        return parts[parts.length - 2] + '.' + parts[parts.length - 1];
    }
    return hostname;
}

function getCurrentDirection() {
    const panel = rfind('#chrome-web-comments-panel');
    if (panel.hasClass('slide-left')) return 'left';
    if (panel.hasClass('slide-top')) return 'top';
    if (panel.hasClass('slide-bottom')) return 'bottom';
    return 'right';
}


const minOpenPanelGap = 130;
const minOpenPanelWidth = 30;
let panelSizeRatio = 0.4;
let panelSizeRatios = {};
let isResizing = false;
let startX = 0;
let startY = 0;
let startRatio = 0.4;

// Throttle function to limit the rate of execution
function throttle(func, delay) {
	let timeoutId;
	let lastExecTime = 0;
	return function (...args) {
		const currentTime = Date.now();
		if (currentTime - lastExecTime > delay) {
			func.apply(this, args);
			lastExecTime = currentTime;
		} else {
			clearTimeout(timeoutId);
			timeoutId = setTimeout(() => {
				func.apply(this, args);
				lastExecTime = Date.now();
			}, delay - (currentTime - lastExecTime));
		}
	};
}

const app = {

	init: () => {
		$(document).on('DOMContentLoaded', async (e) => {
			$(document).off('DOMContentLoaded');

			await app.initCommentLists();
			app.events();
		});
	},

	events: () => {
		let root = rfind('#all-stuff');

		chrome.storage.onChanged.addListener(async(changes, namespace) => {
			app.setProperSubscribedState(document.page_id);
		});

		$(root).on('submit', '#chrome-web-comments-form', app.submitCommentEventHandler);
		$(root).on('click', '#chrome-web-comments-panel-button', app.openPanelButtonClickHdlr);
		$(root).on('submit', '.cwc-answear-form', app.submitAnswerToCommentEventHandler);
		$(root).on('click', '.chrome-web-comments-item-answear', app.showAnswearForm);
		$(root).on('click', '.chrome-web-comments-item-declineBtn', app.hideAnswerForm);
		$(root).on('click', '#chrome-web-comments-panel-close', app.closePanelEventHandler);
		$(root).on('click', '#direction-switcher button', app.directionSwitcherClick);
		$(root).on('input', '#panel-size-slider', app.panelSizeChange);
		$(root).on('mousedown', '#panel-resize-handle', app.startResize);
		$(root).on('mousedown', '#panel-resize-handle-center', app.startResize);
		$(root).on('click', '.cwc-answear-user', app.selectUserAnswear);
		$(root).on('click', '#subscrBtn', app.subscribe);
		$(root).on('click', '#unsubscrBtn', app.unsubscribe);
		$(root).on('click', '.chrome-web-comments-item-editBtn', app.editComment);
		$(root).on('click', '.chrome-web-comments-item-deleteBtn', app.deleteComment);
		$(root).on('click', '.report-button', app.complaintButtonPressedHdl);
		$(root).on('click', '.reaction-button', app.reactionButtonPressedHdl);
		$(root).on('input', '#cwc_user', () => chrome.storage.local.set({ cwc_user: $('#cwc_user').val() }) );

		$(window).on('resize', app.onWindowResize);
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

		let data = await app.request( { action: 'getComments', title: $("title").text() } );

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

		rfind('#chrome-web-comments-panel').addClass('slide-right');

		app.updateCounterButtonText(0);

		app.setProperSubscribedState();

		const site = getSecondLevelDomain();
		const directions = ['right', 'left', 'top', 'bottom'];
		const keys = directions.map(d => `${site}_${d}_panelSizeRatio`);
		chrome.storage.local.get(['cwc_user', ...keys], data => {
			$(shadow).find('#cwc_user').val( data['cwc_user'] ? data['cwc_user'] : 'Аноним' );
			directions.forEach(d => {
				const key = `${site}_${d}_panelSizeRatio`;
				panelSizeRatios[d] = data[key] !== undefined ? data[key] : 0.4;
			});
			panelSizeRatio = panelSizeRatios['right'];
			rfind('#panel-size-slider').val(panelSizeRatio);

			if(document.comments_num > 0) {
				app.panelOpeningRoutine();
			}
		});

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
		args['title'] = $("title").text();
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
					title: $("title").text(),
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

	reactionButtonPressedHdl: async(event) => {
		event.preventDefault();

		const msg_wrap = event.target.closest('.chrome-web-comments-item-wrap');
		const msg_id = msg_wrap.getAttribute("id");

		// Do not hide not-involved reactions anymore
		const bar = $(event.target.closest('.reactions-bar'));
		bar.find('.reactions-not-involved').removeClass('reactions-not-involved');

		// remove previous selection and count
		const prevSelected = bar.find('.selected')
		const selected = $(event.target.closest('.reaction-button'));

		const updateReactionCount = (e, increment) => {
			const countElem = e.find('.reaction-count');
			countElem.text(parseInt(countElem.text()) + increment);
		};

		const isSameReactionPressed = selected.hasClass('selected');

		prevSelected.removeClass('selected');
		updateReactionCount(prevSelected, -1);

		let reactionToSend;

		if(isSameReactionPressed) {
			// deselect reaction
			reactionToSend = "";
		}
		else
		{
			// adds selection and count to new reaction button
			selected.addClass('selected');
			updateReactionCount(selected, 1);
			reactionToSend = event.target.closest('.reaction-button').value;
		}

		const ret = await app.request({ action: 'reaction' },
		{
			msg_id: msg_id,
			reaction: reactionToSend,
		});

		if(ret === undefined)
		{
			app.showErrorBanner("Ошибка отправки реакции");
			return;
		}
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

		//TODO: ditto
		const reaction_tpl = rfind("#template-reaction-buttons")[0];

		const buttonsAvail = [
			{ value: "thumbs_up", picture: "thumbs_up.png", title: "большой палец вверх" },
			{ value: "thumbs_down", picture: "thumbs_down.png", title: "большой палец вниз" },
			{ value: "laughing_face", picture: "emoji_u1f604.svg", title: "смеющееся лицо" },
			{ value: "ok", picture: "ok_hand.png", title: "окей!" },
			{ value: "wolf", picture: "wolves.png", title: "волк" },
			{ value: "party_popper", picture: "party_popper.png", title: "праздник" },
		];

		let zeroed = {};

		let buttons = await buttonsAvail.reduce((acc, button) => {
			if (args.reactions[button.value] !== undefined) {
				acc[button.value] = {
					value: button.value,
					title: button.title,
					picture: button.picture,
					count: args.reactions[button.value],
				};
			}
			else
				zeroed[button.value] = {
					value: button.value,
					title: button.title,
					picture: button.picture,
					count: 0,
				};

			return acc;
		}, {});

		function putBtns(tgt, btnsArr)
		{
			Object.values(btnsArr).forEach(b => {
				const btn = $( document.importNode(reaction_tpl.content, true) );
				btn.find(".reaction-button").attr("value", b.value);
				btn.find(".reaction-button").attr("title", `Реакция "${b.title}"`);
				btn.find(".reaction-count").text(b.count);

				const path = btn.find(".pict").attr("src");
				btn.find(".pict").attr("src", chrome.runtime.getURL(path) + b.picture);

				if(args?.current_reaction == b.value)
					btn.find(".reaction-button").addClass('selected');

				c.find(tgt).append(btn);
			});
		}

		if(Object.keys(buttons).length != 0)
		{
			c.find(".reactions-reminder").hide();
			putBtns(".reactions", buttons);
		}

		putBtns(".reactions-not-involved", zeroed);

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

		const payload = rfind('#panel-payload');

		if (panel.hasClass('slide-top') || panel.hasClass('slide-bottom')) {
			await panel.css('width', `${window.innerWidth}px`);
			await panel.css('height', `${window.innerHeight * panelSizeRatio}px`);
			await payload.css('padding-left', '20px');
			await payload.css('padding-right', '20px');
		} else {
			let w = window.innerWidth * panelSizeRatio;
			const gap = window.innerWidth - w;
			if(gap < minOpenPanelGap) {
				w = window.innerWidth - minOpenPanelGap;
				if(w < minOpenPanelWidth) w = minOpenPanelWidth;
			}
			await panel.css('width', `${w}px`);
			await panel.css('height', `${window.innerHeight}px`);
			if (panel.hasClass('slide-right')) {
				await payload.css('padding-left', '0.7em');
				await payload.css('padding-right', '20px');
			} else if (panel.hasClass('slide-left')) {
				await payload.css('padding-right', '0.7em');
				await payload.css('padding-left', '20px');
			}
		}

		await panel.addClass('active');
	},

	closePanelEventHandler: () => {
		rfind('#chrome-web-comments-panel').removeClass('active');
	},

	directionSwitcherClick: function() {
		const direction = $(this).data('direction');
		const panel = rfind('#chrome-web-comments-panel');
		panel.removeClass('slide-right slide-left slide-top slide-bottom');
		panel.addClass('slide-' + direction);
		panelSizeRatio = panelSizeRatios[direction];
		rfind('#panel-size-slider').val(panelSizeRatio);
		if (panel.hasClass('active')) {
			panel.removeClass('active');
			setTimeout(() => {
				app.panelOpeningRoutine();
			}, 300);
		}
	},

	panelSizeChange: function() {
		panelSizeRatio = parseFloat($(this).val());
		const direction = getCurrentDirection();
		const site = getSecondLevelDomain();
		const key = `${site}_${direction}_panelSizeRatio`;
		chrome.storage.local.set({[key]: panelSizeRatio});
		panelSizeRatios[direction] = panelSizeRatio;
		if (rfind('#chrome-web-comments-panel').hasClass('active')) {
			app.panelOpeningRoutine();
		}
	},

	startResize: function(e) {
		isResizing = true;
		startX = e.clientX;
		startY = e.clientY;
		startRatio = panelSizeRatio;

		// Temporarily remove transitions for smoother resizing
		const panel = rfind('#chrome-web-comments-panel');
		this.originalTransition = panel.css('transition');
		panel.css('transition', 'none');

		$(document).on('mousemove', throttledResize);
		$(document).on('mouseup', app.endResize);
		e.preventDefault();
	},

	doResize: function(e) {
		if (!isResizing) return;
		const panel = rfind('#chrome-web-comments-panel');
		let delta = 0;
		const isVertical = panel.hasClass('slide-top') || panel.hasClass('slide-bottom');
		const dimension = isVertical ? window.innerHeight : window.innerWidth;
		if (panel.hasClass('slide-right')) {
			delta = startX - e.clientX;
		} else if (panel.hasClass('slide-left')) {
			delta = e.clientX - startX;
		} else if (panel.hasClass('slide-top')) {
			delta = e.clientY - startY;
		} else if (panel.hasClass('slide-bottom')) {
			delta = startY - e.clientY;
		}
		const newRatio = Math.max(0.1, Math.min(0.9, startRatio + delta / dimension));
		if (newRatio !== panelSizeRatio) {
			panelSizeRatio = newRatio;
			app.panelOpeningRoutine();
		}
	},

	endResize: function() {
		if (isResizing) {
			isResizing = false;
			const direction = getCurrentDirection();
			const site = getSecondLevelDomain();
			const key = `${site}_${direction}_panelSizeRatio`;
			chrome.storage.local.set({[key]: panelSizeRatio});
			panelSizeRatios[direction] = panelSizeRatio;
			rfind('#panel-size-slider').val(panelSizeRatio);
			$(document).off('mousemove', throttledResize);
			$(document).off('mouseup', app.endResize);

			// Restore transitions
			const panel = rfind('#chrome-web-comments-panel');
			panel.css('transition', this.originalTransition || '');
		}
	},

	onWindowResize: () => {
		if (rfind('#chrome-web-comments-panel').hasClass('active')) {
			app.panelOpeningRoutine();
		}
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

// Create throttled version of doResize
const throttledResize = throttle(app.doResize, 16); // 60 fps

app.init();
