#!/usr/bin/env node
/**
 * Todoist Activities Fetcher
 * 
 * Retrieves activity events from Todoist, with optional filtering for completed items.
 */

const TOKEN = "92c8e007bc150489a9b8f7b739f626fc9a50a303";

/**
 * Fetch activity events from Todoist.
 * 
 * @param {string} token - Todoist API token
 * @param {number} limit - Maximum number of items to fetch (default 50, max 100)
 * @param {string|null} cursor - Pagination cursor for next page
 * @param {string|null} eventTypeFilter - Optional event type to filter (e.g., "completed")
 * @returns {Promise<{results: Array, next_cursor?: string}>}
 */
async function getActivities(token, limit = 50, cursor = null, eventTypeFilter = null) {
  const url = new URL("https://api.todoist.com/api/v1/activities");
  url.searchParams.append("limit", limit.toString());
  if (cursor) {
    url.searchParams.append("cursor", cursor);
  }

  const response = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();

  // Filter by event type if specified
  if (eventTypeFilter) {
    data.results = data.results.filter(
      item => item.event_type === eventTypeFilter
    );
  }

  return data;
}

/**
 * Fetch all activities with pagination support.
 * 
 * @param {string} token - Todoist API token
 * @param {number} limit - Items per page
 * @param {string|null} eventTypeFilter - Optional event type to filter
 * @param {number|null} maxPages - Maximum number of pages to fetch (null for all)
 * @returns {Promise<Array>} List of all activity items
 */
async function getAllActivities(token, limit = 50, eventTypeFilter = null, maxPages = null) {
  const allResults = [];
  let cursor = null;
  let pageCount = 0;

  while (true) {
    const data = await getActivities(token, limit, cursor, eventTypeFilter);
    const mappedResults = data.results.map(item => ({
      event_date: item.event_date,
      event_type: item.event_type,
      extra_data: item.extra_data
    }));
    allResults.push(...mappedResults);

    cursor = data.next_cursor;
    pageCount++;

    if (!cursor || (maxPages && pageCount >= maxPages)) {
      break;
    }
  }

  return allResults;
}

/**
 * Main entry point for the script.
 */
async function main() {
  const token = TOKEN;

  if (!token) {
    console.error("Error: TODOIST_API_TOKEN environment variable not set");
    process.exit(1);
  }

  // Parse command line arguments
  const args = process.argv.slice(2);
  let limit = 50;
  let eventFilter = "completed"; // Default to completed events only
  let outputFormat = "text";

  if (args.includes("--all-events")) {
    eventFilter = null;
  }

  if (args.includes("--json")) {
    outputFormat = "json";
  }

  const limitIndex = args.indexOf("--limit");
  if (limitIndex !== -1) {
    const limitValue = parseInt(args[limitIndex + 1], 10);
    if (isNaN(limitValue)) {
      console.error("Error: --limit requires a numeric argument");
      process.exit(1);
    }
    limit = limitValue;
  }

  try {
    const activities = await getAllActivities(token, limit, eventFilter);

    if (outputFormat === "json") {
      console.log(JSON.stringify(activities, null, 2));
    } else {
      console.log(`Found ${activities.length} completed activities\n`);
      for (const activity of activities) {
        const eventDate = activity.event_date || "Unknown date";
        const content = activity.extra_data?.content || "No content";
        const eventType = activity.event_type || "unknown";

        // Parse and format the date (convert UTC to local time)
        let formattedDate;
        try {
          const dt = new Date(eventDate);
          formattedDate = dt.toLocaleString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
          });
        } catch {
          formattedDate = eventDate;
        }

        console.log(`[${formattedDate}] ${eventType}: ${content}`);
      }
    }

    return activities;
  } catch (error) {
    console.error(`Error fetching activities: ${error.message}`);
    process.exit(1);
  }
}

// Run main if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { getActivities, getAllActivities };
