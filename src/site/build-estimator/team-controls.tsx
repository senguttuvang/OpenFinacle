import { FormSelect } from "../../platform/form-controls/form-select";
import {
  compositions,
  crewFor,
  type TeamInput,
} from "../build-story/build-recipe-model";
import { NumberField } from "./number-field";

export function TeamControls({
  name,
  team,
  tokens,
  onChange,
  onTokens,
}: {
  name: "A" | "B";
  team: TeamInput;
  tokens: number;
  onChange: (team: TeamInput) => void;
  onTokens: (tokens: number) => void;
}) {
  const size = team.interns + team.developers + team.experts;
  return (
    <fieldset className="est-team-controls">
      <legend>
        Team {name}{" "}
        <span>
          {name === "A" ? "Human-led · light AI" : "AI-first · human review"}
        </span>
      </legend>
      <div className="est-pair">
        <NumberField
          label="People"
          ariaLabel={`Team ${name} people`}
          value={size}
          max={100}
          onChange={(value) =>
            onChange({ ...team, ...crewFor(value, team.composition) })
          }
        />
        <label className="est-select">
          Talent mix
          <FormSelect
            aria-label={`Team ${name} talent mix`}
            value={team.composition}
            options={compositions.map((value) => ({ value, label: value }))}
            onValueChange={(value) => {
              const composition = compositions.find((item) => item === value);
              if (composition)
                onChange({
                  ...team,
                  composition,
                  ...crewFor(size, composition),
                });
            }}
          />
        </label>
      </div>
      <p className="est-mix">
        {team.interns} interns · {team.developers} developers · {team.experts}{" "}
        experts
      </p>
      <NumberField
        label="Planned tokens · millions"
        ariaLabel={`Team ${name} planned tokens (millions)`}
        value={tokens}
        max={1000000}
        step={1}
        onChange={onTokens}
      />
    </fieldset>
  );
}
