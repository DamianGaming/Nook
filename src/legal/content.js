import { LEGAL, contactLine } from './config.js'

const N = LEGAL.product
const C = LEGAL.company

// Each page is a list of sections. A section has a heading and blocks: a string is a paragraph, { ul: [...] } is a list.
export const PAGES = {
  terms: {
    title: 'Terms of Service',
    intro: `These terms are the agreement between you and ${C} ("we", "us") about using ${N}. Please read them. By creating an account or using ${N} you agree to them.`,
    sections: [
      {
        h: '1. What Nook is',
        b: [
          `${N} is a free website for chatting with friends: direct messages, group chats with channels and categories, voice and video calls, and screen sharing. There are no servers or public discovery, you join people and groups by invitation or by adding friends.`,
          `${N} is provided by ${C}. You can contact us at ${contactLine()}.`,
        ],
      },
      {
        h: '2. Who can use Nook',
        b: [
          `You must be at least ${LEGAL.minAge} years old to use ${N}. If the age of digital consent where you live is higher than ${LEGAL.minAge}, you must be at least that age, or have your parent or guardian's permission.`,
          'If you are under 18, you should read these terms with a parent or guardian and make sure they are happy for you to use the service. A parent or guardian can ask us to close a child\'s account at any time.',
          'You must not use Nook if you have been banned from it before, or if the law where you live prevents you from using it.',
        ],
      },
      {
        h: '3. Your account',
        b: [
          { ul: [
            'Give accurate information and keep your sign-in details secret. You are responsible for what happens on your account.',
            'One person, one account. Do not share accounts, sell or transfer them, or create accounts to get around a ban or a block.',
            'Tell us straight away if you think someone else is using your account.',
            'Direct messages are encrypted on your device automatically. By default we look after your key so it works on every device without any set-up (see section 7). You can add your own passphrase so that only you can unlock it. If you do, we cannot see or reset it, and if you lose it you will lose access to old encrypted messages.',
          ] },
        ],
      },
      {
        h: '4. Your content and our licence to run the service',
        b: [
          'You keep ownership of what you post: messages, files, voice notes, profile pictures, banners and so on. We do not claim it as ours.',
          `To run ${N} we need your permission to store, copy, transmit, resize and display your content to the people you chose to share it with. You give us a worldwide, non-exclusive, royalty-free licence for that purpose only, and it ends when you delete the content or your account (apart from copies in backups that expire, and content others have already received).`,
          'You are responsible for your content. Only share things you own or have the right to share, and that you are happy for the people in that chat to see, keep, copy and screenshot.',
        ],
      },
      {
        h: '5. Acceptable use',
        b: [
          `Everyone using ${N} must follow our Community Guidelines, which are part of these terms. In short, you must not use ${N} to:`,
          { ul: [
            'harass, bully, threaten, stalk or abuse anyone, or share hateful content aimed at people for who they are;',
            'share sexual content involving anyone under 18, sexually exploit or groom anyone, or share intimate images of anyone without their consent;',
            'share sexually explicit material, graphic violence or gore, or content that promotes self-harm or eating disorders;',
            'promote or carry out terrorism, violent extremism or serious crime, or share instructions for causing serious harm;',
            'scam, phish, spam, spread malware or harvest other people\'s personal information;',
            'pretend to be someone else in a way that is meant to mislead;',
            'break the law, or infringe someone else\'s copyright, trademark or privacy;',
            'attack, probe, overload or reverse engineer the service, or use bots or scrapers without our written permission.',
          ] },
        ],
      },
      {
        h: '6. Moderation, reports and enforcement',
        b: [
          'You can report any message, person or group from inside the app. We review reports and may remove content, warn people, limit features, suspend or permanently remove accounts, and, where the law requires or someone is at risk, tell the authorities.',
          'Group founders can manage their own groups, but they are not employees of ours and cannot speak for us.',
          'If we act on your account we will normally tell you why and give you a way to appeal by contacting us. We may act without notice where there is a risk of serious harm, or where the law stops us from telling you.',
          'Direct messages, and the photos, videos and voice notes in them, are encrypted on your device before they are sent whenever both people have opened Nook since automatic encryption began. Our database only holds scrambled data, so our staff cannot read them through normal access, and we can only act on them if someone sends us a report that includes the message. To make this work without any set-up, we hold the secret that opens your key backup, and it is kept separately from the backup. That means the people who operate Nook could technically unlock it. If you want it to be impossible, add your own passphrase in Settings. Group chats and calls are protected in transit but are not end-to-end encrypted. We never ask for your password or passphrase.',
        ],
      },
      {
        h: '7. End-to-end encryption',
        b: [
          'When you and the person you are talking to both have encryption on, the text, photos, videos and voice notes in your direct messages are scrambled on your device and can only be unscrambled by the two of you. Reactions, read markers, who you talk to, and when, are not encrypted. Group chats and calls are encrypted while travelling to and from our servers, but are not end-to-end encrypted.',
          'Your encryption key is protected automatically, or by a passphrase of your own if you add one (in which case we cannot recover it). Resetting encryption creates a new key and makes older encrypted messages unreadable.',
          'Encryption protects your messages in transit and on our servers. It cannot protect you from someone with access to your unlocked device, from screenshots, or from the person you are talking to saving or sharing what you send.',
        ],
      },
      {
        h: '8. Voice, video and screen sharing',
        b: [
          'Only share your camera, microphone or screen with people you trust, and check what is visible before you share (notifications, passwords, other people\'s details). Do not record or broadcast other people without their consent, and follow the laws on recording where you and they live.',
          'We do not record calls. Calls are carried by a media server run by us or our provider so that people can hear and see each other.',
        ],
      },
      {
        h: '9. Third-party services and links',
        b: [
          `${N} relies on other companies to run (for example for hosting, database, file storage and call media). They are named in our Privacy Policy. Links in chat can take you to websites we do not control. We are not responsible for them, so be careful what you click.`,
        ],
      },
      {
        h: '10. Copyright',
        b: [
          'We respect creators. If you believe something on Nook infringes your copyright, follow our Copyright and Takedown Policy. We may remove infringing content and close the accounts of repeat infringers.',
        ],
      },
      {
        h: '11. The service and changes to it',
        b: [
          `${N} is free. We work hard to keep it running but we do not promise it will always be available, error-free or that it will never lose data. Please keep your own copy of anything important (you can download your data from Settings).`,
          'We may add, change or remove features, set limits (for example on file sizes) and, if we ever need to close the service, we will give you reasonable notice and time to download your data.',
        ],
      },
      {
        h: '12. Ending things',
        b: [
          'You can stop using Nook at any time and delete your account from Settings. Deleting your account removes your profile and your messages and files, as described in our Privacy Policy.',
          'We can suspend or end your access if you seriously or repeatedly break these terms or the Community Guidelines, if the law requires it, or if keeping your account puts others at risk.',
        ],
      },
      {
        h: '13. Disclaimers',
        b: [
          `${N} is provided "as is" and "as available". To the fullest extent the law allows, we do not give any warranties beyond those the law says we must, including that the service will meet your needs or be uninterrupted. Other users, not us, create the content they share, and we do not check it before it is sent.`,
        ],
      },
      {
        h: '14. Our liability',
        b: [
          'Nothing in these terms limits liability that cannot be limited by law, including for death or personal injury caused by negligence, for fraud or fraudulent misrepresentation, or your legal rights as a consumer.',
          `Subject to that, we are not responsible for losses that were not a reasonably foreseeable result of us breaking these terms, for business losses, or for loss caused by other users, by events outside our control, or by you losing your passphrase or device. Because ${N} is free, our total liability to you for anything connected with the service is limited to 100 pounds sterling (or the equivalent in your currency).`,
        ],
      },
      {
        h: '15. Changes to these terms',
        b: [
          'We may update these terms, for example when we add features or the law changes. If a change matters, we will tell you in the app and ask you to accept the new version before you continue. The date at the top shows when they were last updated.',
        ],
      },
      {
        h: '16. Law and disputes',
        b: [
          `These terms are governed by the law of ${LEGAL.jurisdiction}. If you are a consumer, you also keep the mandatory consumer protection rights of the country where you live, and you may bring a claim in the courts where you live. We would always prefer to sort a problem out informally first, so please contact us.`,
        ],
      },
      {
        h: '17. The small print',
        b: [
          'These terms, with the Privacy Policy and Community Guidelines, are the whole agreement between us about Nook. If a part is found unenforceable, the rest still applies. If we do not enforce a right straight away, we have not given it up. You cannot transfer your rights under these terms to someone else, but we can transfer ours as part of running the service.',
          `Questions? Contact ${contactLine()}.`,
        ],
      },
    ],
  },

  privacy: {
    title: 'Privacy Policy',
    intro: `Your privacy matters to us. This policy explains what ${N} collects, why, who sees it, how long we keep it and what control you have. We do not sell your data, show ads, or use tracking cookies.`,
    sections: [
      {
        h: 'Who is responsible for your data',
        b: [`${C} is the controller of personal information processed through ${N} (for UK GDPR and EU GDPR purposes).${LEGAL.address ? ` Our address is ${LEGAL.address}.` : ''} Contact us at ${contactLine()}.`],
      },
      {
        h: 'What we collect',
        b: [
          { ul: [
            'Account details: your email address, username, display name and a securely hashed password (handled by our authentication provider).',
            'Profile details you choose to add: profile picture, banner, bio, pronouns, social links, colours, frame, badges, status and custom status, and the date you joined.',
            'Your content: messages, replies, reactions, files, images, videos and voice messages. Direct messages and their attachments are end-to-end encrypted when both people have turned encryption on, so we only hold scrambled data for them.',
            'Your connections: friends and friend requests, groups you belong to and your role in them, people you block, and reports you make or that are made about you.',
            'Encryption keys: your public key, and a locked copy of your private key. Unless you add your own passphrase, the secret that opens it is stored separately by us so that it works on all your devices.',
            'Live activity: whether you are online and your status, "is typing" signals, and which voice room you are in. These are short-lived.',
            'Technical data: your IP address, browser and device type and security logs, which our infrastructure providers collect to deliver and protect the service. We do not build advertising or behavioural profiles from them.',
            'Calls: audio, video and screen sharing pass through a media server so people can hear and see each other. We do not record calls.',
          ] },
        ],
      },
      {
        h: 'Why we use it, and our legal basis',
        b: [
          { ul: [
            'To provide Nook, including creating your account, delivering messages and running calls (it is necessary to perform our contract with you).',
            'To keep Nook safe: handling reports, preventing abuse, spam and fraud, enforcing our terms and securing the service (our legitimate interests, and sometimes a legal obligation).',
            'To communicate with you about your account, security and important changes (contract, legitimate interests).',
            'To meet legal duties, such as responding to valid legal requests or protecting children (legal obligation).',
            'Where we rely on your consent (for example desktop notifications), you can withdraw it at any time in Settings or your browser.',
          ] },
        ],
      },
      {
        h: 'Who can see what',
        b: [
          'Your profile (name, picture, banner, bio, links, badges, status and when you joined) can be seen by people who can view you in a chat, group or friend list, and by anyone who opens your profile card.',
          'Messages in a group can be seen by members of that group. Direct messages can be seen by the two people in the chat, and, if encryption is on for both, by nobody else.',
          'Anyone you chat with can copy or screenshot what you send. Please share carefully.',
        ],
      },
      {
        h: 'End-to-end encryption',
        b: [
          'Encrypted direct messages are scrambled on your device, and our database holds only the scrambled version, so we generally have no readable message content to hand over. If you have added your own passphrase, we cannot unlock your messages at all.',
          'What remains visible to us is information about the conversation, like who is talking to whom, when, message sizes and reactions. Group chats and calls are encrypted in transit and while stored, but not end-to-end.',
          'If you report an encrypted message, you choose to send its text to us, and we use it only to review the report.',
        ],
      },
      {
        h: 'Who we share data with',
        b: [
          'We do not sell personal information and we do not share it for advertising. We use trusted companies (processors) who only handle data on our instructions:',
          { ul: [
            'Supabase: authentication, database, file storage and real-time updates.',
            'LiveKit: the media server for voice, video and screen sharing.',
            'Netlify: hosting and delivery of the website.',
          ] },
          'We may also disclose information if we are legally required to, to protect someone from serious harm, to investigate abuse or illegal activity, or if the service is transferred to another organisation (they would have to honour this policy).',
        ],
      },
      {
        h: 'International transfers',
        b: ['Our providers may process data in countries outside the UK or European Economic Area. Where they do, we rely on safeguards the law recognises, such as the UK International Data Transfer Agreement or the EU Standard Contractual Clauses.'],
      },
      {
        h: 'How long we keep data',
        b: [
          { ul: [
            'Account and profile: until you delete your account.',
            'Messages and files: until you or the other participants delete them, or until your account is deleted. Deleting a message removes it for everyone in the chat.',
            'Reports and safety records: as long as needed to deal with the report and prevent repeat abuse, usually no longer than 24 months after it is closed, longer if the law requires or an investigation is open.',
            'Live status and voice room signals: seconds to minutes.',
            'Security and server logs: kept by our providers for short, limited periods under their own policies.',
            'Backups: removed from backups within a reasonable period after deletion.',
          ] },
        ],
      },
      {
        h: 'Your rights and choices',
        b: [
          'Depending on where you live (for example under the UK GDPR, EU GDPR or California law) you can: ask what we hold about you and get a copy, correct it, delete it, restrict or object to some uses, move it to another service, and withdraw consent. We will not treat you worse for using your rights.',
          { ul: [
            'Download your data: Settings, then Privacy and safety, then Download my data.',
            'Edit your profile: Settings, then My profile.',
            'Delete your account and data: Settings, then Account.',
            'Anything else: contact us at ' + contactLine() + '.',
          ] },
          'If you are unhappy with how we handle your data, you can complain to the Information Commissioner\'s Office (ico.org.uk) in the UK, or your local data protection authority. We would appreciate the chance to put things right first.',
          'We do not sell or share personal information as those terms are defined in California law, and we do not use automated decisions that have legal effects on you.',
        ],
      },
      {
        h: 'Children',
        b: [`${N} is not for children under ${LEGAL.minAge}, and we do not knowingly collect their data. If you believe a child under ${LEGAL.minAge} has an account, tell us and we will remove it. Parents and guardians can contact us to review or delete a child's information.`],
      },
      {
        h: 'Cookies and storage on your device',
        b: [
          `${N} does not use advertising or analytics cookies. It stores a few things in your browser that it needs in order to work: your sign-in session, your voice and sound settings, notes you write about people (kept only on your device), which message you last read, trusted encryption fingerprints, and your encryption key if you choose to keep this device unlocked. Because these are strictly necessary, no cookie banner is required. You can clear them in your browser at any time.`,
        ],
      },
      {
        h: 'Security',
        b: ['We use encryption in transit, database access rules that limit each person to their own data, and end-to-end encryption for direct messages. No system is perfectly secure. If a data breach is likely to put you at risk, we will tell you and the regulator as the law requires.'],
      },
      {
        h: 'Changes to this policy',
        b: ['We will update this policy when our practices change and tell you in the app about important changes. The date at the top shows the latest version.'],
      },
    ],
  },

  rules: {
    title: 'Community Guidelines',
    intro: `${N} should be a warm, safe place for everyone. These rules apply to messages, profiles, group names, files, voice and video. They are part of the Terms of Service.`,
    sections: [
      {
        h: 'Be kind and treat people with respect',
        b: [{ ul: [
          'No harassment, bullying, threats, stalking, dogpiling or encouraging others to do so.',
          'No hate or discrimination against people because of race, ethnicity, nationality, religion, caste, sex, gender identity, sexual orientation, disability, age or health.',
          'No unwanted contact. If someone blocks you or asks you to stop, stop.',
        ] }],
      },
      {
        h: 'Keep everyone, especially young people, safe',
        b: [
          { ul: [
            'Zero tolerance for sexual content involving minors, grooming, or any attempt to sexualise or exploit a child. We remove it, close accounts and report to the authorities (for example the National Crime Agency, the Internet Watch Foundation and NCMEC).',
            'No sharing, asking for or threatening to share intimate images of anyone without their consent.',
            'No sexually explicit content. Nook is open to teenagers, so adult content is not allowed anywhere, including profiles and group names.',
            'Adults must not contact or befriend young people to pursue romantic or sexual relationships.',
          ] },
        ],
      },
      {
        h: 'No violence, danger or self-harm content',
        b: [{ ul: [
          'No credible threats, glorifying violence, graphic gore or shocking content.',
          'No content that promotes, encourages or gives instructions for suicide, self-harm or eating disorders. Talking about how you are feeling is fine, and we want you to reach out for support (see the Safety page).',
          'No terrorism, violent extremism, or recruiting for them.',
          'No selling or promoting illegal drugs, weapons or other illegal goods and services.',
        ] }],
      },
      {
        h: 'Keep Nook honest and secure',
        b: [{ ul: [
          'No scams, phishing, fake giveaways, spam, chain messages or unwanted promotion.',
          'No malware, harmful links, or attempts to take over accounts.',
          'No impersonating other people, staff or organisations to mislead.',
          'No sharing other people\'s private information (doxxing), including addresses, phone numbers, private photos or screenshots of private chats posted to shame someone.',
          'No ban evasion, fake or mass accounts, or abusing reports.',
        ] }],
      },
      {
        h: 'Respect creators and the law',
        b: ['Do not share content you do not have the right to share, or break the law. See the Copyright and Takedown Policy.'],
      },
      {
        h: 'Voice, video and screen sharing',
        b: [{ ul: [
          'The same rules apply live. Do not share, show or stream anything that would break these rules.',
          'Do not record or rebroadcast other people without their permission.',
          'Check your screen before you share it so nothing private appears.',
        ] }],
      },
      {
        h: 'Groups',
        b: [
          'Founders look after their groups: they can set topics, channels and rules, and remove members. Group rules can be stricter than ours but never looser. Founders should act on harmful content in their groups and report serious problems to us.',
        ],
      },
      {
        h: 'How we enforce these rules',
        b: [
          'Depending on how serious the problem is, we may remove content, give a warning, limit features, suspend an account or remove it permanently. Serious harm, especially to children, leads to immediate removal and may be reported to the authorities.',
          'We rely on reports. Use Report on a message or profile to tell us, and choose the closest reason. Reports are private and the person you report is not told who made them.',
          `If you think we got it wrong, contact ${contactLine()} and tell us why. We will take another look.`,
        ],
      },
      {
        h: 'If you see something wrong',
        b: [{ ul: [
          'Block the person (profile card, then Block) so they cannot message you.',
          'Report the message or the person.',
          'If someone is in immediate danger, contact your local emergency services first.',
        ] }],
      },
    ],
  },

  copyright: {
    title: 'Copyright and Takedown Policy',
    intro: `${N} respects intellectual property and expects its users to as well. This page explains how to tell us about infringing content and how we deal with it. It follows the process used under the US Digital Millennium Copyright Act and similar laws.`,
    sections: [
      {
        h: 'How to send a takedown notice',
        b: [
          `Email ${contactLine()} with the following. Notices that are not complete may not be actionable.`,
          { ul: [
            'Your name and contact details, and whether you are the copyright owner or are authorised to act for them.',
            'A description of the copyrighted work you say has been infringed.',
            'Where the content is on Nook (the group, channel or chat and the link or a description). Because direct messages are private and encrypted, we can only act on them if you include the content.',
            'A statement that you have a good faith belief the use is not authorised by the owner, their agent or the law.',
            'A statement, made under penalty of perjury, that the information is accurate and that you are authorised to act for the owner.',
            'Your physical or electronic signature.',
          ] },
        ],
      },
      {
        h: 'What we do',
        b: [
          'We review complete notices promptly. If appropriate we remove or disable the content and tell the person who posted it, with a copy of the notice. Notices may be shared with the person who posted the content.',
        ],
      },
      {
        h: 'Counter-notices',
        b: [
          'If you think we removed your content by mistake or wrongly, you can send us a counter-notice with: your contact details; the content that was removed and where it was; a statement under penalty of perjury that you have a good faith belief it was removed by mistake; and your consent to the courts in your location. If the person who complained does not start legal action within 10 to 14 business days, we may restore the content.',
        ],
      },
      {
        h: 'Repeat infringers',
        b: ['We close the accounts of people who repeatedly infringe copyright.'],
      },
      {
        h: 'Trademarks and other claims',
        b: [`For trademark, privacy or other legal complaints, contact ${contactLine()} and explain the problem and where the content is.`],
      },
    ],
  },

  safety: {
    title: 'Safety and Support',
    intro: 'Tools, tips and where to get help. If you or someone else is in immediate danger, contact your local emergency services (999 in the UK, 112 in the EU, 911 in the US) first.',
    sections: [
      {
        h: 'Tools you control',
        b: [{ ul: [
          'Block: stops someone messaging you. Open their profile card and choose Block.',
          'Report: tell us about a message or a person. Choose the closest reason and add detail if it helps.',
          'Friends only: you decide who to add. You can decline requests and leave any group at any time.',
          'Privacy: only share what you are happy for others to see. Your profile is visible to people who can see you.',
          'Encryption: turn on end-to-end encryption in Settings so only you and the other person can read your DMs.',
        ] }],
      },
      {
        h: 'Staying safe online',
        b: [{ ul: [
          'Be careful with people you only know online. Never share your address, school, passwords, or financial information.',
          'Be wary of links, files, giveaways or anyone rushing you. Nook staff will never ask for your password or passphrase.',
          'If something feels wrong, you can leave, block and report. You never have to explain yourself.',
          'Screen sharing shows everything on the screen, including notifications. Close private windows first.',
        ] }],
      },
      {
        h: 'For parents and guardians',
        b: [
          `Nook is for people ${LEGAL.minAge} and over. Talk with your child about who they chat with and what they share. You can ask to close their account at any time, and you can read our Community Guidelines together. Nook does not show ads and does not sell data. If you have a concern, contact ${contactLine()}.`,
        ],
      },
      {
        h: 'If you or someone you know needs support',
        b: [{ ul: [
          'UK and Ireland: Samaritans, call 116 123 (free, any time). Childline for under 19s: 0800 1111.',
          'US: call or text 988 (Suicide and Crisis Lifeline).',
          'Elsewhere: findahelpline.com lists free local services.',
          'Worried about a child or seeing sexual content involving a child: in the UK report to the Internet Watch Foundation (report.iwf.org.uk) or CEOP (ceop.police.uk), in the US to NCMEC (report.cybertip.org). Please also report it to us.',
        ] }],
      },
    ],
  },
}

export const ORDER = ['terms', 'privacy', 'rules', 'copyright', 'safety']
