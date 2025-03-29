function addToDisplay(url, title, commentsCount)
{
    const template = $("#recentItemTpl")[0];

    const c = $( document.importNode(template.content, true) );

    c.find(".page-link").attr("href", url);
    c.find(".page-link").text(title + commentsCount);
    c.find(".subscription-link .msgs-cnt").text(commentsCount);

    $('#recentList').append(c);
}

document.addEventListener("DOMContentLoaded", async () => {
    chrome.action.getBadgeText({}, (t) => {
        if(t == " ! ")
            $('#cwc-error').show();
    });

    /* const s = await subscriptions.getSortedSubscriptions(); */
    /* FIXME: replace by backend query: */
    const s = [
    {
        "url": "sfsdfdsf",
        "title": "some vacancy page",
        "new_added": "вчера",
        "commentsCount": 123
    },
    {
        "url": "dgdfgdfg",
        "title": "some vacancy page - 2",
        "new_added": "в среду",
        "commentsCount": 555
    },
    ];

    s.forEach((e) => addToDisplay(e.url, e.title, e.commentsCount));
});
