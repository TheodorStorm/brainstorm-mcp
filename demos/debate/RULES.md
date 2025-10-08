# Debate Rules

**Read this file before debating.** These rules apply to both Agent A (PRO) and Agent B (CON).

## Core Principles

### 1. Intellectual Honesty
- 🎯 **Truth-seeking, not "winning"** - The goal is to find the most accurate position
- 🎯 **Admit when wrong** - If evidence contradicts your stance, acknowledge it
- 🎯 **Refine based on evidence** - Adjust your position when presented with strong arguments
- 🎯 **Be respectful but rigorous** - Challenge ideas, not the person
- 🎯 **Focus on logic and evidence** - Avoid emotional appeals or rhetoric

### 2. Evidence Standards
- ✅ **Use credible sources** - Scientific papers, expert opinions, peer-reviewed data
- ✅ **Be specific** - Cite exact sources with URLs when possible
- ✅ **Check multiple sources** - Don't rely on single sources
- ✅ **Evaluate source credibility** - Consider author expertise, publication venue, bias
- ✅ **Distinguish correlation from causation** - Don't confuse the two

### 3. Argument Quality
- ✅ **One claim per argument** - Don't bundle multiple claims together
- ✅ **Be specific and precise** - Avoid vague or ambiguous language
- ✅ **Acknowledge valid counterpoints** - Even if they challenge your stance
- ✅ **Address the strongest opposing arguments** - Don't cherry-pick weak points
- ✅ **Define key terms** - Ensure both parties understand what's being debated

## Debate Process

### Message Structure

All debate messages should follow this structure:

```json
{
  "action": "argument" | "counter_argument" | "consensus_reached",
  "stance": "for" | "against",
  "position": "Your main argument or claim",
  "evidence": ["Source 1", "Source 2", "Source 3"],
  "challenge": "What you're challenging in opponent's argument (optional)",
  "round": 1
}
```

### Debate Flow

1. **Opening Arguments**
   - Agent A (PRO): Present argument FOR with 3+ sources
   - Agent B (CON): Present argument AGAINST with 3+ sources

2. **Exchange Rounds**
   - Each agent responds to the other's latest argument
   - Challenge specific points with evidence
   - Present new evidence that strengthens your position
   - Acknowledge valid points from opponent

3. **Refinement Phase**
   - Positions become more nuanced
   - Both parties move toward more accurate statements
   - Precision increases through challenge and response

4. **Consensus**
   - Signal when you agree with opponent's refined position
   - State the agreed consensus clearly
   - Explain your reasoning for agreement

## Using Web Search Effectively

### Search Strategies

**Agent A (PRO) searches:**
- "[topic] evidence supporting"
- "[topic] scientific consensus"
- "[topic] expert opinions favor"
- "[topic] studies confirm"

**Agent B (CON) searches:**
- "[topic] evidence against"
- "[topic] debunked"
- "[topic] criticisms"
- "[topic] exceptions to"
- "[topic] alternative explanations"

### Evaluating Sources

**Credible sources:**
- ✅ Peer-reviewed scientific journals
- ✅ Government research agencies
- ✅ University research departments
- ✅ Established scientific organizations
- ✅ Expert consensus statements

**Questionable sources:**
- ❌ Opinion blogs without citations
- ❌ Advocacy sites with clear bias
- ❌ Outdated information (>10 years for science)
- ❌ Uncited claims
- ❌ Logical fallacies

## Challenging Techniques

### For Agent B (CON) - How to Challenge

- 🔨 **Question methodology** - "How was this study conducted? What's the sample size?"
- 🔨 **Find exceptions** - "This may be true for X, but what about Y?"
- 🔨 **Demand precision** - "Define 'round' - does that mean perfectly spherical?"
- 🔨 **Check causation** - "Does A cause B, or are they just correlated?"
- 🔨 **Propose alternatives** - "Could Z also explain these findings?"
- 🔨 **Test edge cases** - "What happens in extreme conditions?"

### For Agent A (PRO) - How to Defend

- 🛡️ **Provide methodology** - "Here's how the study was conducted..."
- 🛡️ **Address exceptions** - "Yes, there are edge cases, but generally..."
- 🛡️ **Define precisely** - "By 'round' I mean approximately spherical..."
- 🛡️ **Show causation** - "Multiple studies show A causes B because..."
- 🛡️ **Counter alternatives** - "That explanation doesn't account for X..."
- 🛡️ **Add context** - "Within normal conditions, the statement holds..."

## Reaching Consensus

### When to Signal Agreement

**You should agree when:**
- ✅ Opponent presents evidence you cannot refute
- ✅ Your position has been refined to match theirs
- ✅ A nuanced middle ground emerges that's more accurate
- ✅ The evidence clearly supports their position
- ✅ Continued debate won't improve accuracy

### Consensus Message Format

```json
{
  "action": "consensus_reached",
  "agreed_position": "The earth is approximately spherical in shape",
  "reasoning": "Agent B correctly pointed out 'round' is imprecise. The oblate spheroid shape is well-established.",
  "final_stance": "I now agree the statement should be: 'The earth is approximately spherical, with slight flattening at the poles'"
}
```

## Common Pitfalls to Avoid

### Logical Fallacies
- ❌ **Ad hominem** - Attacking the source rather than the argument
- ❌ **Straw man** - Misrepresenting opponent's argument
- ❌ **Appeal to authority** - "Expert X said so" without evidence
- ❌ **False dichotomy** - Presenting only two options when more exist
- ❌ **Slippery slope** - Claiming one thing inevitably leads to extreme outcome
- ❌ **Circular reasoning** - Using conclusion as a premise

### Poor Debate Practices
- ❌ **Moving goalposts** - Changing your claim when challenged
- ❌ **Cherry-picking** - Only citing evidence that supports you
- ❌ **Gish gallop** - Overwhelming with quantity over quality
- ❌ **Proof by verbosity** - Making arguments unnecessarily complex
- ❌ **Winning over truth** - Caring more about "being right" than finding truth

## Example: Good vs Bad Arguments

### ❌ Bad Argument (Vague, No Evidence)
```
"The earth is round because everyone knows it is."
```

### ✅ Good Argument (Specific, Cited)
```
"The earth is approximately spherical in shape, as evidenced by:
1. NASA satellite imagery showing a spherical planet
2. The physics of gravitational collapse forming spheres above certain mass
3. Ships disappearing hull-first over the horizon due to curvature
Sources: [NASA Earth Observatory, Physics of Planetary Formation, Maritime observations]"
```

### ❌ Bad Challenge (Ad Hominem)
```
"Your source is biased, so you're wrong."
```

### ✅ Good Challenge (Evidence-Based)
```
"While your source shows general spherical shape, geodetic surveys reveal the earth is actually an oblate spheroid - flattened at the poles by ~0.3% due to rotation. The term 'round' is imprecise.
Sources: [USGS Geodetic Survey, International Earth Rotation Service]"
```

## Summary

1. **Be honest** - Seek truth, not victory
2. **Use evidence** - Every claim needs credible sources
3. **Be precise** - Define terms, avoid vagueness
4. **Challenge rigorously** - But respectfully
5. **Refine positions** - Based on evidence, not ego
6. **Reach consensus** - When evidence clearly points to agreement

**The best debates end with both parties having a more accurate understanding than when they started.**
