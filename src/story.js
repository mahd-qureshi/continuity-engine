/** Authored story content. Conditions refer to decisions, never to a hidden score. */
export const character = Object.freeze({
  name: "Mara",
  age: 24,
  role: "Restoration apprentice",
  description:
    "Good with things that need fixing. Less sure when to leave them alone.",
  history: Object.freeze([
    "In April, Eli promised to drive her to her apprenticeship interview. He never came.",
    "At home, broken things have a way of ending up beside her cup.",
  ]),
});

export const story = Object.freeze({
  id: "last-train",
  title: "Before the last train",
  subtitle: "One person. Five decisions. A life that remembers.",
  totalSteps: 5,
});

export const initialMemories = Object.freeze([
  Object.freeze({
    id: "interview",
    text: "Eli never came to drive Mara to her interview. She paid for a taxi and went alone.",
    sourceStep: 0,
  }),
  Object.freeze({
    id: "fixing",
    text: "At home, Mara usually handles the repairs, the forms, and the difficult phone calls.",
    sourceStep: 0,
  }),
]);

const option = (id, label, description) => ({ id, label, description });
const recall = (state, step) => {
  const memory = state.memories.find((item) =>
    step === 0 ? item.id === "interview" : item.sourceStep === step,
  );
  return memory ? { text: memory.text, sourceStep: memory.sourceStep } : null;
};
const together = (state) => state.choices[0] === "meet";
const contact = (state) =>
  state.choices[0] === "later"
    ? "messages"
    : together(state)
      ? "person"
      : "phone";

export function sceneFor(state) {
  const [reply, apology, help, promise] = state.choices;
  const mode = contact(state);
  const common = { chapter: state.choices.length + 1, memory: null };
  switch (state.choices.length) {
    case 0:
      return {
        ...common,
        id: "the-message",
        location: "Station concourse",
        time: "22:42",
        title: "Before you go.",
        paragraphs: [
          "Mara has a one-way ticket and a small case of tools. Tomorrow she starts a restoration apprenticeship in another city. For once, the thing she is going to work on belongs to her.",
          "The last train leaves at 23:10. Her brother’s name lights up her phone.",
          "Before you go, can we talk?",
        ],
        memory: recall(state, 0),
        choices: [
          option(
            "meet",
            "Come to the station.",
            "There is time to see him before the train.",
          ),
          option(
            "call",
            "Call me. I’m here.",
            "Hear him out without waiting for him to arrive.",
          ),
          option("later", "We can text.", "Keep the conversation in messages."),
        ],
      };
    case 1:
      return {
        ...common,
        id: "the-apology",
        location: together(state)
          ? "Outside the station café"
          : "Station concourse",
        time: "22:49",
        title: "The part he left out.",
        paragraphs: [
          mode === "person"
            ? "Eli finds her beside the closed café. He has walked quickly; she can tell by the way he pretends he hasn’t."
            : mode === "phone"
              ? "He picks up on the second ring. She can hear packing tape coming off a roll. Then he puts it down."
              : "Her phone vibrates. ‘Text is fine,’ Eli writes. The typing indicator appears, disappears, then appears again.",
          mode === "messages"
            ? "His message continues: ‘The van was fine in April. I forgot the interview. I was embarrassed, so I lied. I wanted you to know before you left.’"
            : "‘The van was fine in April,’ he says. ‘I forgot the interview. Then I was embarrassed, so I lied.’ He looks for another sentence and doesn’t find one.",
          "She remembers the taxi meter. Mostly, she remembers telling the interviewer she hadn’t had any trouble getting there.",
        ],
        memory: recall(state, 0),
        choices: [
          option(
            "name-hurt",
            "I needed you that morning.",
            "Tell him what getting there alone actually cost.",
          ),
          option(
            "accept",
            "Thank you for telling me.",
            "Accept the apology without settling everything tonight.",
          ),
          option(
            "not-now",
            "I can’t do this properly here.",
            "Keep the apology for a conversation with more time.",
          ),
        ],
      };
    case 2:
      return {
        ...common,
        id: "one-more-thing",
        location: together(state) ? "Platform stairs" : "Platform 4",
        time: "22:56",
        title: "One more thing.",
        paragraphs: [
          apology === "name-hurt"
            ? mode === "messages"
              ? "‘I know,’ he writes. A second message follows. ‘No. I should have known.’ He doesn’t offer an excuse this time."
              : "‘I know,’ Eli says. Then he corrects himself. ‘No. I should have known.’ He doesn’t offer an excuse this time."
            : apology === "accept"
              ? mode === "messages"
                ? "His reply is another thank you. It is a slightly awkward exchange, but neither of them tries to improve it."
                : "Eli says thank you too. It is a slightly awkward exchange, but neither of them tries to improve it."
              : mode === "messages"
                ? "‘Okay,’ he writes. ‘When you’re ready.’ The apology stays where she left it."
                : "‘All right,’ he says. They let the apology sit between them without an answer.",
          "Then there is the flat. The landlord is holding their deposit over some crooked shelves. The handover is tomorrow; Eli has been putting off the email.",
          apology === "name-hurt"
            ? mode === "messages"
              ? "Another message: ‘I know how this sounds. But do you still have the photographs? I don’t know what to write.’"
              : "‘I know how this sounds,’ he says. ‘But do you still have the photographs? I don’t know what to write.’"
            : mode === "messages"
              ? "‘Could you help me write to him?’ Eli texts. ‘You know where the photographs are.’"
              : "‘Could you help me write to him?’ Eli asks. ‘You know where the photographs are.’",
        ],
        memory: {
          text: state.memories.find((item) => item.id === "fixing").text,
          sourceStep: 0,
        },
        choices: [
          option(
            "write-together",
            "Let’s write it together.",
            "Spend the remaining time getting the email started.",
          ),
          option(
            "send-photos",
            "I’ll send you the photographs.",
            "Give him the evidence. Let him find the words.",
          ),
          option(
            "his-job",
            "You can handle this.",
            "Leave the email and the handover with him.",
          ),
        ],
      };
    case 3:
      return {
        ...common,
        id: "after-tonight",
        location: "Platform 4",
        time: "23:04",
        title: "After tonight.",
        paragraphs: [
          help === "write-together"
            ? "They have a subject line and half a paragraph. Mara is rearranging a sentence when the rails begin to hum. She knows how the email should end. Writing it would be quicker than explaining."
            : help === "send-photos"
              ? mode === "messages"
                ? "Mara sends six photographs, each dated before they moved in. ‘Right,’ he replies. ‘I can work with these.’ For once, a task has passed through her hands without staying there."
                : "Mara sends six photographs, each dated before they moved in. Eli opens them. ‘Right,’ he says. ‘I can work with these.’ For once, a task has passed through her hands without staying there."
              : together(state)
                ? "There is a pause. Then Eli says he will find the tenancy agreement when he gets home. Mara nearly tells him which drawer. She leaves it there."
                : mode === "messages"
                  ? "The typing indicator comes and goes. Then Eli writes that he will find the tenancy agreement. Mara nearly tells him which drawer. She lets him look."
                  : "There is a pause. Then Eli says he will find the tenancy agreement. Mara nearly tells him which drawer. She lets him look.",
          apology === "not-now"
            ? "They still haven’t talked about April. Leaving the station will not make that conversation disappear."
            : apology === "name-hurt"
              ? "What she said about April is still there. It has made the conversation less easy, and more specific."
              : "She accepted his apology. She is still allowed to want things to be different.",
          mode === "messages"
            ? "A new message arrives: ‘When should I check in?’ She can promise a time, or leave that undecided."
            : "‘When will I hear from you?’ Eli asks. She can promise a time, or leave that undecided.",
        ],
        memory: recall(state, 2),
        choices: [
          option(
            "sunday",
            "Sunday. Six o’clock.",
            "Set aside a call that isn’t about the flat.",
          ),
          option(
            "arrival",
            "I’ll text when I get there.",
            "Promise something small enough to mean.",
          ),
          option(
            "space",
            "I need a little time first.",
            "Leave the next conversation unscheduled.",
          ),
        ],
      };
    case 4: {
      const choices = [
        option(
          "board",
          "Board. Say goodbye.",
          help === "write-together"
            ? "Send him the unfinished draft. Let him finish it."
            : "Take the train, with the arrangement you have made.",
        ),
      ];
      if (help === "write-together")
        choices.push(
          option(
            "finish-email",
            "Board. Finish the email.",
            "Take the work with you. It matters to you, too.",
          ),
        );
      choices.push(
        option(
          "stay",
          "Let this train go.",
          "Ask to start the apprenticeship a day later. The answer will have to wait.",
        ),
      );
      return {
        ...common,
        id: "the-doors",
        location: "Platform 4",
        time: "23:09",
        title: "The doors are open.",
        paragraphs: [
          together(state)
            ? "The train has stopped. Eli stands beside her case, leaving the handle free."
            : "The train has stopped. Mara lifts her case. Around her, people are checking carriage numbers.",
          promise === "sunday"
            ? "Sunday at six is in both their calendars. It is the only thing she has promised about next week."
            : promise === "arrival"
              ? "She has promised a message when she arrives. Nothing beyond that needs an answer tonight."
              : "Eli has agreed to wait for her to call. There is no date attached to it.",
          help === "write-together"
            ? "The unfinished email is still on her screen. She can take it onto the train, or hand it back."
            : help === "send-photos"
              ? "The photographs are on Eli’s phone now. Whatever he writes next will be his."
              : "The landlord’s email is still unanswered. It is also no longer waiting for her.",
          "She could stay. It would mean asking the workshop to move her start date, and spending tonight not knowing their answer. She could go. The door is right here.",
        ],
        memory: recall(state, 3),
        choices,
      };
    }
    default:
      return {
        ...common,
        chapter: 5,
        id: "complete",
        location: "The end",
        time: "23:10",
        title: "A place to begin.",
        paragraphs: [],
        choices: [],
        memory: null,
      };
  }
}

const outcomes = {
  meet: [
    "She sends the name of the station café. Eli says he can be there in seven minutes.",
    "Mara invited Eli to the station before her departure.",
    ["Eli joins Mara in person."],
    0,
    10,
  ],
  call: [
    "She calls before she can make the message more complicated.",
    "Mara made room for a call while keeping her departure in view.",
    ["The conversation happens by phone."],
    4,
    6,
  ],
  later: [
    "‘We can text. I’m waiting for the train.’ She presses send and keeps the conversation open.",
    "Mara agreed to talk by text while waiting for her train.",
    ["Mara and Eli keep their conversation in messages."],
    6,
    2,
  ],
  "name-hurt": [
    "‘I needed you that morning. Getting there wasn’t the hard part.’ She lets the sentence stand.",
    "Mara told Eli that his absence mattered more than the missed ride.",
    ["The hurt is named instead of being assumed."],
    5,
    6,
  ],
  accept: [
    "She thanks him for telling her. It is an answer to the apology, not a promise to forget.",
    "Mara accepted Eli’s honesty without erasing what happened.",
    ["Eli knows his apology was heard."],
    0,
    8,
  ],
  "not-now": [
    "‘I can’t do this properly here.’ Eli agrees to leave it there.",
    "Mara left the apology unresolved rather than forcing an answer.",
    ["The conversation about April remains unfinished."],
    6,
    -4,
  ],
  "write-together": [
    "She opens a blank email. They begin with the date they moved in.",
    "Mara began writing the landlord’s email with Eli.",
    [
      "A shared draft exists.",
      "Finishing the email on the train becomes an option.",
    ],
    -6,
    6,
  ],
  "send-photos": [
    "She finds the move-in folder and sends it. ‘These show the shelves already leaning.’",
    "Mara gave Eli the photographs and left the email to him.",
    ["Eli has the evidence to write the email himself."],
    6,
    3,
  ],
  "his-job": [
    "‘You can handle this. The agreement’s in the flat.’ She stops before giving him a list.",
    "Mara left the landlord’s email and the handover with Eli.",
    ["Eli takes responsibility for the flat."],
    9,
    -4,
  ],
  sunday: [
    "They agree on Sunday at six. Not a call about the deposit; just a call.",
    "Mara and Eli arranged a call for Sunday at six.",
    ["A specific time to reconnect is agreed."],
    2,
    8,
  ],
  arrival: [
    "‘I’ll text when I get there.’ Eli’s answer is a relieved thank you.",
    "Mara promised to send a message when she arrived.",
    ["Mara has made one small, immediate promise."],
    3,
    3,
  ],
  space: [
    "‘I need a little time first.’ Eli doesn't ask how much.",
    "Mara asked for time without scheduling the next conversation.",
    ["The next conversation will wait until Mara is ready."],
    8,
    -5,
  ],
  "finish-email": [
    "She boards, sits down, and opens the draft again. Through the glass, the platform begins to move.",
    "Mara took the train and kept responsibility for finishing the email.",
    ["Mara leaves tonight.", "The unfinished work travels with her."],
    -3,
    3,
  ],
  stay: [
    "She steps back. The doors close. She opens a message to the workshop and asks if she can start a day later.",
    "Mara deliberately let the last train leave and requested a later start.",
    [
      "Departure is postponed by Mara’s choice.",
      "The workshop has not yet agreed to change her start date.",
    ],
    -2,
    4,
  ],
};

export function outcomeFor(state, choice) {
  const entry =
    choice.id === "board"
      ? [
          state.choices[2] === "write-together"
            ? "She sends Eli the half-written email. ‘You know the rest.’ Then she takes her case onto the train."
            : state.choices[0] === "later"
              ? "She sends a goodbye and steps onto the train. Her case catches briefly on the door; she lifts it clear."
              : "She says goodbye and steps onto the train. Her case catches briefly on the door; she lifts it clear.",
          state.choices[2] === "write-together"
            ? "Mara boarded and handed the unfinished email back to Eli."
            : "Mara boarded the last train with the arrangements she had chosen.",
          [
            "Mara leaves tonight.",
            ...(state.choices[2] === "write-together"
              ? ["Eli will finish the draft."]
              : []),
          ],
          8,
          0,
        ]
      : outcomes[choice.id];
  if (!entry) throw new Error(`No authored outcome for ${choice.id}.`);
  const [consequence, memory, changes, resolve, openness] = entry;
  return {
    consequence,
    memory,
    changes: [...changes],
    deltas: { resolve, openness },
  };
}

export function endingFor(state) {
  if (!state.finished) return null;
  const [reply, apology, help, promise, departure] = state.choices;
  const callbacks = [
    state.memories.find((item) => item.id === "interview"),
    ...state.memories.filter((item) => item.sourceStep > 0),
  ].map(({ text, sourceStep }) => ({ text, sourceStep }));
  const apologyLine =
    apology === "name-hurt"
      ? "Eli knows now why April hurt. That does not mend it, but she will not have to explain the same silence again."
      : apology === "accept"
        ? "She is glad he told her the truth about April. Gladness and disappointment turn out to fit in the same seat."
        : "The conversation about April is still unfinished. She chose to leave it that way for now.";
  const promiseLine =
    promise === "sunday"
      ? "On Sunday at six, they will have a place to pick this up. She does not have to decide the whole conversation tonight."
      : promise === "arrival"
        ? "When she arrives, she will send the message she promised. She can mean that much without promising everything."
        : "There is no next call in her calendar. For a while, she can find out what an evening feels like when it belongs to her.";
  const goodbye =
    reply === "meet"
      ? "Eli is still on the platform when the train pulls away. She raises a hand; he raises his."
      : reply === "call"
        ? "The call ends before the train moves. For a moment the carriage is louder than she expected."
        : "She sends one last message: ‘On the train.’ This time, she puts the phone away before a reply arrives.";
  if (departure === "stay")
    return {
      id: "tomorrow",
      title: "Tomorrow, then.",
      paragraphs: [
        "The platform empties. The workshop will not read her message until morning. She has asked to start a day later; she has not been told yes.",
        reply === "meet"
          ? "‘I didn’t ask you to stay,’ Eli says. ‘I know,’ Mara says. They carry her case back up the stairs together."
          : reply === "later"
            ? "She texts Eli that she is still at the station. ‘Are you sure?’ he writes. She types that it was her decision. She is not quite sure yet."
            : "She tells Eli she is still at the station. ‘Are you sure?’ he asks. She says it was her decision. She is not quite sure yet.",
        help === "write-together"
          ? "They will finish the email tonight. She also needs to book another train. Both things are real, and both need doing."
          : help === "send-photos"
            ? "The photographs are still with Eli. Staying does not mean she has taken the landlord’s email back."
            : "The flat is still Eli’s job. Staying does not have to mean doing everything.",
        apologyLine,
        promiseLine,
      ],
      summary:
        "Mara chose another night in the city. Her apprenticeship start is now an open question.",
      callbacks,
    };
  if (departure === "finish-email")
    return {
      id: "still-working",
      title: "One more paragraph.",
      paragraphs: [
        "By the first stop, the email is finished. Mara sends it to Eli to forward. Their deposit matters; so does the half-hour she has spent on it.",
        goodbye,
        apologyLine,
        promiseLine,
        "She closes the draft. Outside, the windows have become mirrors. The tool case is at her feet.",
      ],
      summary:
        "Mara took the train and finished the work. Leaving did not automatically change who handles it.",
      callbacks,
    };
  let result;
  if (help === "write-together")
    result = {
      id: "unfinished",
      title: "An unfinished sentence.",
      opening:
        "Eli has the draft. It is missing an ending, but he has lived in the same flat and knows what happened. Mara watches his typing indicator appear, then puts the phone face down.",
      summary:
        "Mara started the work, then handed it back. The train left with her on it.",
    };
  else if (help === "send-photos")
    result = {
      id: "in-his-hands",
      title: "In his hands.",
      opening:
        "The photographs are sent. Eli has what he needs, and the email will be written in his words. Mara opens the workshop’s welcome letter instead.",
      summary: "Mara shared what she knew and left the next step to Eli.",
    };
  else if (promise === "sunday")
    result = {
      id: "sunday",
      title: "Sunday, six o’clock.",
      opening:
        "The flat belongs to tomorrow’s list, and tomorrow’s list belongs to Eli. Sunday is different. Mara has made room for her brother without making herself responsible for his morning.",
      summary:
        "Mara left the work with Eli and kept a specific time for them to talk.",
    };
  else if (promise === "arrival")
    result = {
      id: "arrival",
      title: "A message from elsewhere.",
      opening:
        "Mara checks the arrival time. In a few hours she will send Eli the name of a station he has never visited. For tonight, that is the whole promise.",
      summary:
        "Mara left the flat to Eli and kept one small promise of contact.",
    };
  else
    result = {
      id: "room",
      title: "A little room.",
      opening:
        "There is no email to finish and no call to arrange. Mara takes out the workshop’s letter, then puts it away again. She has a whole journey in which nothing needs an answer.",
      summary:
        "Mara left the work behind and gave herself time before the next conversation.",
    };
  return {
    id: result.id,
    title: result.title,
    paragraphs: [result.opening, goodbye, apologyLine, promiseLine],
    summary: result.summary,
    callbacks,
  };
}
