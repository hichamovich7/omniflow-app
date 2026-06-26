export const IMAGE_PROMPT_ID = 'pinterest-image-v2';

export const IMAGE_CONFIG = {
  size: '1024x1536',
  maxBatchSize: 10,
  concurrency: 3,
} as const;

interface ImagePromptContext {
  title: string;
  description: string;
  keywords: string;
  board: string;
  image_prompt: string;
}

export function buildImagePrompt(ctx: ImagePromptContext, version = 1): string {
  const photographyStyle = inferPhotographyStyle(ctx.board);

  const lines = [
    ctx.image_prompt,
    '',
    `Photography style: ${photographyStyle}.`,
    'Camera: high-end full-frame DSLR, tack-sharp focus on the main subject, shallow depth of field with soft creamy bokeh background.',
    'Lighting: soft diffused natural light with gentle directional shadows and warm golden hour tones where appropriate.',
    'Composition: clean and uncluttered, rule of thirds, strong visual hierarchy with a single clear focal point, vertical 2:3 portrait orientation filling the entire frame edge to edge with no empty margins.',
    'Colors: rich saturated natural tones, harmonious warm palette, no harsh neon or artificial colors.',
    'Detail: ultra high resolution with visible textures on all surfaces and materials, crisp fine details throughout.',
    'Mood: aspirational, polished, premium, inviting, scroll-stopping Pinterest aesthetic.',
  ];

  if (version > 1) {
    lines.push(
      '',
      `VARIATION DIRECTIVE (version ${version}): Create a distinctly different visual interpretation of the same subject. Vary at least three of the following: camera angle (overhead, eye-level, low angle, 45-degree, close-up, wide), composition layout (centered, off-center, negative space left vs right, diagonal leading lines), lighting mood (cool morning, warm golden hour, bright midday, soft overcast, dramatic side-lit), styling and props (different arrangement, alternative surfaces, complementary accessories, seasonal elements), color temperature (warmer, cooler, more muted, more vibrant), and perspective depth (tight macro detail, medium context, wide environmental). The result must look like a fresh take by a different photographer, not a minor edit of the same shot.`,
    );
  }

  lines.push(
    '',
    'CRITICAL CONSTRAINTS: The image must contain absolutely no text, no typography, no letters, no numbers, no words, no captions, no titles, no watermarks, no logos, no brand names, no stamps, no overlays, no frames, no borders, no collage layouts, no split screens, no arrows, no icons, and no graphic design elements of any kind. Produce a single clean photographic image only.',
  );

  return lines.join('\n');
}

function inferPhotographyStyle(board: string): string {
  const b = board.toLowerCase();

  if (/food|recipe|cook|bak|meal|dish|cuisine|drink|cocktail|smoothie|dessert|snack|breakfast|lunch|dinner/.test(b)) {
    return 'professional food photography, overhead or 45-degree angle, artfully styled plating on natural wood or marble surfaces, fresh ingredient garnishes, steam or texture details visible';
  }
  if (/home|decor|interior|furniture|living|bedroom|kitchen|bathroom|room|apartment|house|renovation/.test(b)) {
    return 'high-end interior design photography, architectural perspective with leading lines, carefully styled spaces with curated accessories, natural window light creating depth';
  }
  if (/travel|destination|adventure|explore|vacation|hotel|beach|mountain|city|wander|backpack/.test(b)) {
    return 'cinematic travel photography, wide establishing shots with sense of scale and atmosphere, vivid natural scenery, dramatic sky and landscape interaction';
  }
  if (/fashion|outfit|style|cloth|wear|dress|accessor|wardrobe|trend|streetwear/.test(b)) {
    return 'fashion editorial photography, styled outfits in curated settings, complementary color palette between clothing and environment, flattering natural light';
  }
  if (/garden|plant|flower|outdoor|botanical|herb|succulent|landscap/.test(b)) {
    return 'botanical photography with sharp macro details, dewy natural textures, lush green color palette, soft morning or golden hour light filtering through foliage';
  }
  if (/beauty|makeup|skin|hair|cosmetic|nail|spa|wellness|glow|skincare/.test(b)) {
    return 'beauty photography with close-up precision, flawless studio-quality lighting, dewy luminous textures, clean minimal backdrop emphasizing product or look';
  }
  if (/fitness|workout|exercise|gym|yoga|health|sport|training|athlet|pilates/.test(b)) {
    return 'dynamic fitness lifestyle photography, energetic poses with intentional motion, strong directional light creating muscle definition, motivational atmosphere';
  }
  if (/diy|craft|handmade|project|tutorial|maker/.test(b)) {
    return 'overhead flat lay or workspace photography, organized materials and tools with hands-in-frame action, warm natural light on textured surfaces';
  }
  if (/kid|child|baby|parent|family|nursery|toddler|mother|father|parenting/.test(b)) {
    return 'warm family lifestyle photography, soft candid moments with genuine expressions, pastel and neutral tones, gentle diffused window light';
  }
  if (/business|office|entrepreneur|productivity|work|startup|marketing|career|finance/.test(b)) {
    return 'modern corporate lifestyle photography, clean minimalist workspaces, professional yet approachable atmosphere, bright even lighting';
  }
  if (/wedding|bridal|engagement|celebration|party|event/.test(b)) {
    return 'romantic event photography, elegant details and soft backlighting, dreamy bokeh, warm golden tones with delicate floral or fabric textures';
  }
  if (/pet|dog|cat|animal|puppy|kitten/.test(b)) {
    return 'professional pet photography, expressive animal portraits with catchlight in eyes, warm natural outdoor or cozy indoor settings';
  }
  if (/art|illustration|paint|drawing|creative|ceramic|pottery/.test(b)) {
    return 'artistic still life photography, intentional composition with dramatic directional lighting, rich textures and bold color contrasts';
  }
  if (/education|learn|study|school|teach|book|read/.test(b)) {
    return 'clean academic lifestyle photography, organized study spaces, warm inviting atmosphere, soft natural light with books and stationery as props';
  }
  if (/tech|gadget|digital|computer|phone|electronic/.test(b)) {
    return 'sleek product photography, clean minimal surfaces, precise studio lighting highlighting form and material, modern tech aesthetic';
  }
  if (/holiday|christmas|halloween|easter|valentine|season|festiv/.test(b)) {
    return 'festive themed photography, warm ambient lighting with seasonal decorations, cozy inviting atmosphere, rich seasonal color palette';
  }
  if (/organiz|clean|minimalist|declutter|storage|tidy/.test(b)) {
    return 'clean organizational photography, satisfying symmetry and order, neutral palette with pops of color, bright even lighting showing every detail';
  }

  return 'premium lifestyle editorial photography, clean polished composition, natural lighting with professional finish, aspirational and visually compelling';
}
