// Made-up messages for trying Untangle. The university, the building, the people, the addresses and the phone numbers
// are invented; .example domains and 555 numbers cannot reach anyone. Dates are set relative to the day the sample is
// opened, so the deadlines are always in the near future.

import { addDays, parseIso } from './dates'

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** The first date on or after `from` that falls on the weekday (0 = Sunday). */
function onOrAfter(from: string, dow: number): string {
  return addDays(from, (dow - parseIso(from).getUTCDay() + 7) % 7)
}
const md = (d: string) => `${MONTH[parseIso(d).getUTCMonth()]} ${parseIso(d).getUTCDate()}`
const wmd = (d: string) => `${WEEKDAY[parseIso(d).getUTCDay()]}, ${md(d)}`

export interface Sample {
  id: string
  label: string
  received: string // the day the message arrived, so "within 10 business days" has a starting point
  text: string
}

export function samples(today: string): Sample[] {
  const aidDue = onOrAfter(addDays(today, 9), 5)
  const leaseEnd = onOrAfter(addDays(today, 33), 0)
  const forward = addDays(leaseEnd, -19)
  const labDue = onOrAfter(addDays(today, 8), 4)
  const missedLab = addDays(today, 3)
  return [
  {
    id: 'aid',
    label: 'Financial aid email',
    received: today,
    text: `Subject: Action needed: verify your 2027-28 financial aid

Hi Jordan,

Your financial aid application has been selected for verification. This is a routine review, but your aid cannot be paid until it is complete. Please read this whole message.

To complete verification, you will need to submit the following documents through the Student Portal (portal.northfield.example/verify) by ${wmd(aidDue)} at 5:00 p.m.:
- A signed copy of the 2027-28 Verification Worksheet
- Your 2025 IRS tax return transcript (not the full tax return)
- Proof of high school completion, if we do not already have it on file

If you are a dependent student, one of your parents must also sign the worksheet. Make sure every page is readable and that your student ID number is written at the top of each page. Do not email documents; we cannot accept them by email for privacy reasons.

After you upload your documents, check your Northfield email within 10 business days, because we may ask for more information. Late documents may delay your aid until the spring term, and your housing deposit will not be refunded if your aid is cancelled.

If you have questions, contact the Office of Student Financial Services at finaid@northfield.example or 555-0142, Monday to Friday, 9 a.m. to 4 p.m.

Thank you,
Office of Student Financial Services`,
  },
  {
    id: 'moveout',
    label: 'Move-out letter',
    received: today,
    text: `Move-out instructions for 14B Alder Court

Dear resident,

Your lease ends on ${wmd(leaseEnd)}. To get your full deposit back, please follow these steps.

1. Give us your forwarding address by ${md(forward)} so we can mail your deposit.
2. Book a move-out inspection at least 3 days before you leave: call 555-0187 or use the link in your tenant portal.
3. Defrost and clean the fridge, then leave the door open.
4. Remove all furniture and personal items, including anything on the balcony.
5. Return both keys and the parking fob to the office by 12:00 noon on ${md(leaseEnd)}.

You will need: your lease number, the inspection confirmation email, and a photo ID.

Do not leave items by the bins; bulk waste left behind is charged at $75 per item. Cleaning that we have to do ourselves will be deducted from your deposit.

Questions? Write to office@aldercourt.example.

Thank you for living with us!`,
  },
  {
    id: 'lab',
    label: 'Lab report brief',
    received: today,
    text: `Lab report 3: enzyme kinetics

Write a 4-6 page report on the enzyme kinetics experiment. Use the template on the course page and submit it as a PDF on Canvas by 11:59 p.m. on ${wmd(labDue)}.

Your report should include a title page, an abstract of 150 words or fewer, methods, results with at least two figures, and a discussion. All figures must have labelled axes and units. Cite at least three peer-reviewed sources in APA style.

Late reports lose 10% of the mark per day.

If you missed the lab session, email Dr. Okafor at okafor@northfield.example before ${md(missedLab)} to get the shared data set.`,
  },
  ]
}
