/** Synthetic handwritten answer text used to render demo answer booklets. */

const BY_COURSE: Record<string, string[]> = {
  "BL9.1": [
    "Human rights are inherent, inalienable and universal. The Universal Declaration of Human Rights, 1948 laid down a common standard of achievement for all peoples, and its principles were given binding force through the ICCPR and the ICESCR of 1966.",
    "In India, the Protection of Human Rights Act, 1993 established the National Human Rights Commission. In D.K. Basu v. State of West Bengal (1997) the Supreme Court laid down guidelines on arrest and detention, treating custodial violence as a violation of Article 21.",
    "The doctrine of progressive realisation applies to economic and social rights, whereas civil and political rights demand immediate respect. Yet the Court in Olga Tellis read the right to livelihood into the right to life.",
  ],
  "BL9.2": [
    "Under the Income-tax Act, 1961 the charge of tax is on the 'total income' of the previous year. Residential status under Section 6 determines the scope of total income under Section 5.",
    "GST is a destination-based consumption tax. Under the CGST Act, 2017 'supply' under Section 7 is the taxable event; input tax credit under Section 16 avoids the cascading effect of earlier indirect taxes.",
    "The distinction between tax avoidance and evasion was discussed in McDowell & Co. v. CTO and later in Vodafone International Holdings, where the Court upheld legitimate tax planning.",
  ],
  "BL9.3": [
    "The Arbitration and Conciliation Act, 1996 is based on the UNCITRAL Model Law. Section 8 obliges a judicial authority to refer parties to arbitration where a valid arbitration agreement exists.",
    "Minimal judicial intervention under Section 5 is the cornerstone of the Act. In BALCO (2012) the Supreme Court held that Part I does not apply to foreign-seated arbitrations.",
    "Mediation offers a consensual, confidential process. The Mediation Act, 2023 now provides a statutory framework, including pre-litigation mediation and the enforceability of settlement agreements.",
  ],
  "BL9.4": [
    "Comparative constitutional law studies how different polities structure power. The Westminster model emphasises parliamentary sovereignty, whereas the American model rests on a rigid separation of powers.",
    "The basic structure doctrine evolved in Kesavananda Bharati (1973). Similar implied limits on amendment have been recognised in Bangladesh and debated in Kenya and Colombia.",
    "Judicial review in India is broader than in the UK, where courts may only issue declarations of incompatibility under the Human Rights Act, 1998.",
  ],
};

const GENERIC = [
  "The question raises the relationship between law and society. Law is not merely a command of the sovereign but an instrument of social engineering, as Roscoe Pound argued.",
  "Applying this framework to the Indian context, the Constitution of India serves as the grundnorm, and every legislative and executive act must conform to Part III.",
  "In conclusion, a balanced approach that respects individual liberty while pursuing social justice is required, consistent with the Directive Principles in Part IV.",
];

export function answerText(courseCode: string, question: number) {
  const pool = BY_COURSE[courseCode] ?? GENERIC;
  return [pool[question % pool.length], pool[(question + 1) % pool.length]];
}
