export function inferPhotographyStyle(category: string): string {
  const b = category.toLowerCase();

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
