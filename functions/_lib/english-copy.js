export const englishCopy = {
  trends: {
    intro: 'Discover video trends through examples from different creators. Explore recurring formats, compare video performance, and find an idea for your next shoot.',
    blocks: [
      ['A trend finder built around video ideas', 'A reveal, a visual joke, or a familiar situation can become a format that many creators make their own. This trend finder groups videos around those shared ideas, so you can see what connects them. Read the scenario, browse the examples, and decide how you would adapt it for your audience.'],
      ['Start your trend search with the examples', 'Trend discovery gets more useful when you look beyond a single successful video. Compare how different creators open the same scenario, pace the action, and deliver the ending. Use the available view and engagement counts as context while you choose a format to try.'],
    ],
  },
  tiktok: {
    intro: 'Explore TikTok trends through video examples and their view, like, and comment counts. Find a format worth watching, then use it as a starting point for your own take.',
    blocks: [
      ['Explore current TikTok trends through actual videos', 'A trend can revolve around a sound, a camera move, a recurring joke, or a simple sequence of actions. Browse the collection to spot those patterns and see how creators interpret them. Open the original video when you want to check the sound, caption, or comments before planning your version.'],
      ['Choose a trend you can make your own', 'When exploring TikTok trends right now, look for an idea that fits your subject and the way you like to film. Pay attention to the opening moment, the setup, and the payoff. Keep the part that makes the format recognizable, then bring your own situation, perspective, or ending.'],
    ],
  },
  reels: {
    intro: 'Browse trending Reels for visual ideas, editing approaches, and formats to try. Compare videos and their available engagement counts to find inspiration for your next Reel.',
    blocks: [
      ['Explore Instagram trends through the details', 'Look at how a Reel introduces its subject, uses text on screen, and moves from one shot to the next. An outfit transition, a before-and-after reveal, or an everyday observation can give you a starting point for a different topic. Use the examples to understand the idea before planning your own version.'],
      ['Turn trending Reels into a filming idea', 'As you browse Instagram Reels trends, choose a format you can adapt with the people, location, and footage available to you. Decide what viewers should notice first and what they should see at the end. Compare the available views, likes, and comments for context, then develop a version that suits your audience.'],
    ],
  },
  shorts: {
    intro: 'Explore trending YouTube Shorts and find ideas for your next video. Browse examples, compare view counts, and look for a premise you can develop in your own way.',
    blocks: [
      ['Find YouTube Shorts ideas you can build on', 'Start with a clear question, a surprising result, or a situation viewers can recognize immediately. While browsing the collection, notice how each video introduces its premise and reaches its payoff. Use those observations to shape an original demonstration, story, or joke around your own subject.'],
      ['Compare the most viewed YouTube Shorts in this collection', 'Look at higher-viewed videos alongside smaller examples. Compare their opening shots, explanations, pacing, and endings to form your own ideas about what holds attention. View counts show how many views were recorded when a video was collected; they do not explain the result on their own or guarantee that another version will perform the same way.'],
    ],
  },
};

const escapeHTML = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
export function renderEnglishCopy(section) {
  return renderPageCopy(englishCopy[section], 'About this collection');
}

export function renderPageCopy(copy, label) {
  return {
    intro: `<p class="page-intro">${escapeHTML(copy.intro)}</p>`,
    details: `<section class="page-details" aria-label="${escapeHTML(label)}">` + copy.blocks.map(([heading, text]) =>
      `<section><h2>${escapeHTML(heading)}</h2><p>${escapeHTML(text)}</p></section>`).join('') + '</section>',
  };
}
