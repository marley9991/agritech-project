const categories = {
  project_management: [
    ['Asana','asana','https://asana.com'], ['Monday.com','monday','https://monday.com'], ['ClickUp','clickup','https://clickup.com'], ['Trello','trello','https://trello.com'], ['Jira','jira','https://www.atlassian.com/software/jira'], ['Basecamp','basecamp','https://basecamp.com'], ['Wrike','wrike','https://www.wrike.com'], ['Smartsheet','smartsheet','https://www.smartsheet.com'], ['Linear','linear','https://linear.app'], ['Todoist','todoist','https://todoist.com']
  ],
  crm_sales: [
    ['Salesforce','salesforce','https://www.salesforce.com'], ['HubSpot CRM','hubspot-crm','https://www.hubspot.com/products/crm'], ['Pipedrive','pipedrive','https://www.pipedrive.com'], ['Zoho CRM','zoho-crm','https://www.zoho.com/crm'], ['Freshsales','freshsales','https://www.freshworks.com/crm/sales'], ['Close','close','https://close.com'], ['Copper','copper','https://www.copper.com'], ['Insightly','insightly','https://www.insightly.com'], ['Keap','keap','https://keap.com'], ['Zendesk Sell','zendesk-sell','https://www.zendesk.com/sell']
  ],
  communication: [
    ['Slack','slack','https://slack.com'], ['Microsoft Teams','microsoft-teams','https://www.microsoft.com/microsoft-teams'], ['Zoom','zoom','https://zoom.us'], ['Google Meet','google-meet','https://meet.google.com'], ['Discord','discord','https://discord.com'], ['Loom','loom','https://www.loom.com'], ['Intercom','intercom','https://www.intercom.com'], ['Front','front','https://front.com'], ['Chanty','chanty','https://www.chanty.com'], ['Whereby','whereby','https://whereby.com']
  ],
  automation: [
    ['Zapier','zapier','https://zapier.com'], ['Make','make','https://www.make.com'], ['n8n','n8n','https://n8n.io'], ['Workato','workato','https://www.workato.com'], ['Power Automate','power-automate','https://powerautomate.microsoft.com'], ['IFTTT','ifttt','https://ifttt.com'], ['Pipedream','pipedream','https://pipedream.com'], ['Tray.ai','tray-ai','https://tray.ai'], ['Activepieces','activepieces','https://www.activepieces.com'], ['Parabola','parabola','https://parabola.io']
  ],
  ai_tools: [
    ['ChatGPT','chatgpt','https://chatgpt.com'], ['Claude','claude','https://claude.ai'], ['Gemini','gemini','https://gemini.google.com'], ['Perplexity','perplexity','https://www.perplexity.ai'], ['Jasper','jasper','https://www.jasper.ai'], ['Copy.ai','copy-ai','https://www.copy.ai'], ['Writesonic','writesonic','https://writesonic.com'], ['Grammarly','grammarly','https://www.grammarly.com'], ['Notion AI','notion-ai','https://www.notion.so/product/ai'], ['Otter.ai','otter-ai','https://otter.ai']
  ],
  design_content: [
    ['Canva','canva','https://www.canva.com'], ['Figma','figma','https://www.figma.com'], ['Adobe Creative Cloud','adobe-creative-cloud','https://www.adobe.com/creativecloud.html'], ['Webflow','webflow','https://webflow.com'], ['Framer','framer','https://www.framer.com'], ['Descript','descript','https://www.descript.com'], ['Miro','miro','https://miro.com'], ['Visme','visme','https://www.visme.co'], ['VEED','veed','https://www.veed.io'], ['Riverside','riverside','https://riverside.fm']
  ],
  finance_accounting: [
    ['QuickBooks Online','quickbooks-online','https://quickbooks.intuit.com'], ['Xero','xero','https://www.xero.com'], ['FreshBooks','freshbooks','https://www.freshbooks.com'], ['Wave','wave','https://www.waveapps.com'], ['Sage Accounting','sage-accounting','https://www.sage.com'], ['Zoho Books','zoho-books','https://www.zoho.com/books'], ['Bonsai','bonsai','https://www.hellobonsai.com'], ['Ramp','ramp','https://ramp.com'], ['Brex','brex','https://www.brex.com'], ['Dext','dext','https://dext.com']
  ],
  customer_support: [
    ['Zendesk','zendesk','https://www.zendesk.com'], ['Freshdesk','freshdesk','https://www.freshworks.com/freshdesk'], ['Help Scout','help-scout','https://www.helpscout.com'], ['Gorgias','gorgias','https://www.gorgias.com'], ['HelpCrunch','helpcrunch','https://helpcrunch.com'], ['LiveChat','livechat','https://www.livechat.com'], ['Tidio','tidio','https://www.tidio.com'], ['Crisp','crisp','https://crisp.chat'], ['Kustomer','kustomer','https://www.kustomer.com'], ['Gladly','gladly','https://www.gladly.com']
  ],
  analytics_data: [
    ['Google Analytics','google-analytics','https://analytics.google.com'], ['Mixpanel','mixpanel','https://mixpanel.com'], ['Amplitude','amplitude','https://amplitude.com'], ['Heap','heap','https://heap.io'], ['Hotjar','hotjar','https://www.hotjar.com'], ['Looker Studio','looker-studio','https://lookerstudio.google.com'], ['Tableau','tableau','https://www.tableau.com'], ['Power BI','power-bi','https://powerbi.microsoft.com'], ['Metabase','metabase','https://www.metabase.com'], ['Segment','segment','https://segment.com']
  ],
  developer_tools: [
    ['GitHub','github','https://github.com'], ['GitLab','gitlab','https://about.gitlab.com'], ['Bitbucket','bitbucket','https://bitbucket.org'], ['Postman','postman','https://www.postman.com'], ['Sentry','sentry','https://sentry.io'], ['Datadog','datadog','https://www.datadoghq.com'], ['New Relic','new-relic','https://newrelic.com'], ['Vercel','vercel','https://vercel.com'], ['Netlify','netlify','https://www.netlify.com'], ['Cloudflare','cloudflare','https://www.cloudflare.com']
  ]
};

const priceByCategory = {
  project_management: 12, crm_sales: 29, communication: 8, automation: 19,
  ai_tools: 20, design_content: 15, finance_accounting: 24, customer_support: 25,
  analytics_data: 18, developer_tools: 14
};

const trialless = new Set(['Salesforce','Adobe Creative Cloud','Tableau','Datadog','Brex','Ramp']);

const tools = Object.entries(categories).flatMap(([category, rows]) => rows.map(([tool_name, slug, source_url], index) => ({
  tool_name,
  slug,
  category,
  monthly_price: Number((priceByCategory[category] + (index % 5) * 7).toFixed(2)),
  has_free_trial: !trialless.has(tool_name),
  rating: Number((4.1 + ((index + category.length) % 9) / 10).toFixed(2)),
  source_url,
  logo_url: `${source_url.replace(/\/$/, '')}/favicon.ico`,
  affiliate_url: `${process.env.AFFILIATE_BASE_URL || 'https://example.com/affiliate'}/${slug}`,
  verified: true
})));

const useCases = [
  'remote teams', 'small businesses', 'marketing teams', 'sales operations',
  'customer support', 'finance teams', 'software development', 'content creation',
  'data analysis', 'workflow automation'
];

function buildComparisons(toolRows = tools) {
  const byCategory = new Map();
  for (const tool of toolRows) {
    if (!byCategory.has(tool.category)) byCategory.set(tool.category, []);
    byCategory.get(tool.category).push(tool);
  }
  const comparisons = [];
  for (const tool of toolRows) {
    const peers = (byCategory.get(tool.category) || []).filter(peer => peer.slug !== tool.slug).slice(0, 2);
    peers.forEach((competitor, offset) => {
      const use_case = useCases[(tool.slug.length + offset) % useCases.length];
      const cheaper = tool.monthly_price <= competitor.monthly_price;
      comparisons.push({
        primary_tool_id: tool.id,
        competitor_tool_id: competitor.id,
        primary_tool_slug: tool.slug,
        competitor_tool_slug: competitor.slug,
        use_case,
        slug: `${tool.slug}-vs-${competitor.slug}`,
        key_difference: `${tool.tool_name} is positioned for ${use_case}; ${cheaper ? 'it has a lower seeded monthly price' : 'the competitor has a lower seeded monthly price'} in this comparison dataset.`,
        verdict: cheaper
          ? `${tool.tool_name} is the value-oriented starting point for ${use_case}.`
          : `${competitor.tool_name} is the value-oriented starting point for ${use_case}; choose ${tool.tool_name} when its feature depth matters more.`
      });
    });
  }
  return comparisons;
}

module.exports = { tools, buildComparisons, useCases };
