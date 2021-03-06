import * as intentRunner from "../../background/intentRunner.js";
import * as serviceList from "../../background/serviceList.js";
import * as languages from "../../background/languages.js";
import * as pageMetadata from "../../background/pageMetadata.js";
import * as searching from "../../searching.js";

const QUERY_DATABASE_EXPIRATION = 1000 * 60 * 60 * 24 * 30; // 30 days
const queryDatabase = new Map();

intentRunner.registerIntent({
  name: "navigation.navigate",
  async run(context) {
    const query = context.slots.query;
    const cached = queryDatabase.get(query.toLowerCase());
    if (cached) {
      await context.openOrFocusTab(cached.url);
    } else {
      const tab = await context.createTabGoogleLucky(query);
      const url = tab.url;
      queryDatabase.set(query.toLowerCase(), {
        url,
        date: Date.now(),
      });
      // Sometimes there's a very quick redirect
      setTimeout(async () => {
        const newTab = await browser.tabs.get(tab.id);
        if (newTab.url !== url) {
          queryDatabase.set(query.toLowerCase(), {
            url: newTab.url,
            date: Date.now(),
          });
        }
      }, 1000);
      saveQueryDatabase();
    }
    context.done();
  },
});

intentRunner.registerIntent({
  name: "navigation.clearQueryDatabase",
  async run(context) {
    queryDatabase.clear();
    saveQueryDatabase();
    context.displayText('"Open" database/cache cleared');
  },
});

intentRunner.registerIntent({
  name: "navigation.bangSearch",
  async run(context) {
    const service = context.slots.service || context.parameters.service;
    const myurl = await searching.ddgBangSearchUrl(
      context.slots.query,
      service
    );
    context.addTelemetryServiceName(
      `ddg:${serviceList.ddgBangServiceName(service)}`
    );
    await context.createTab({ url: myurl });
    browser.runtime.sendMessage({
      type: "closePopup",
      sender: "find",
    });
  },
});

intentRunner.registerIntent({
  name: "navigation.translate",
  async run(context) {
    const language = context.slots.language || "english";
    const tab = await context.activeTab();
    const translation = `https://translate.google.com/translate?hl=&sl=auto&tl=${
      languages.languageCodes[language.toLowerCase().trim()]
    }&u=${encodeURIComponent(tab.url)}`;
    browser.tabs.update(tab.id, { url: translation });
  },
});

intentRunner.registerIntent({
  name: "navigation.translateSelection",
  async run(context) {
    const language = context.slots.language || "english";
    const tab = await context.activeTab();
    const selection = await pageMetadata.getSelection(tab.id);
    if (!selection || !selection.text) {
      const e = new Error("No text selected");
      e.displayMessage = "No text selected";
      throw e;
    }
    const url = `https://translate.google.com/#view=home&op=translate&sl=auto&tl=${
      languages.languageCodes[language.toLowerCase().trim()]
    }&text=${encodeURIComponent(selection.text)}`;
    await browser.tabs.create({ url });
  },
});

async function saveQueryDatabase() {
  const expireTime = Date.now() - QUERY_DATABASE_EXPIRATION;
  const entries = [];
  for (const [url, value] of queryDatabase.entries()) {
    if (value.date >= expireTime) {
      entries.push([url, value]);
    }
  }
  await browser.storage.local.set({ queryDatabase: entries });
}

intentRunner.registerIntent({
  name: "navigation.goBack",
  async run(context) {
    const tab = await context.activeTab();
    await browser.tabs.executeScript(tab.id, {
      code: "window.history.back();",
    });
  },
});

intentRunner.registerIntent({
  name: "navigation.goForward",
  async run(context) {
    const tab = await context.activeTab();
    await browser.tabs.executeScript(tab.id, {
      code: "window.history.forward();",
    });
  },
});

async function loadQueryDatabase() {
  const result = await browser.storage.local.get(["queryDatabase"]);
  if (result && result.queryDatabase) {
    for (const [key, value] of result.queryDatabase) {
      queryDatabase.set(key, value);
    }
  }
}

loadQueryDatabase();
